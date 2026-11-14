//! `POST /api/assistants/wizard/stream` — the agent-builder wizard.
//!
//! Old: `src/app/api/assistants/wizard/stream/route.ts` and
//! `src/features/assistants/wizard/{service,tools,schema}.ts`.
//!
//! The answer is the AI SDK v6 UI message stream, the same one the old route sent
//! (`result.toUIMessageStreamResponse()`, `ai` 6.0): `start`, a `start-step` per step, the
//! text as `text-start`/`text-delta`/`text-end`, every tool call as `tool-input-start` and
//! `tool-input-delta` while it streams, then `tool-input-available` followed by
//! `tool-output-available` (or `tool-input-error` and `tool-output-error` for arguments that
//! do not fit the tool), a `finish-step` per step, `finish` with the last step's reason, and
//! `[DONE]`.
//!
//! The proposal reaches the client in the `tool-input-available` chunk whose `toolName` is
//! `proposeAgent`: `src/features/assistants/wizard/hooks/use-wizard-stream.ts` reads
//! `tool-input-available` and applies `input` as the draft. The `input` in that chunk is
//! the sanitised proposal, the way the old code mutated the payload in place before the
//! frame was written.
//!
//! What changed on the way (docs/port/differences.md):
//! - the model the wizard runs on, the models it offers and the plan of the organisation
//!   come from the caller's hook ([`crate::policy::WizardModel`]), not from the route;
//! - the errors use the standard body, and a bad request is a 400 with every bad field;
//! - the model provider's own words never reach the client;
//! - a `refineAgent` patch is filtered like a proposal (row 61);
//! - a client that disconnects stops the turn and the upstream request at once.

use axum::body::Body as AxumBody;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use futures::StreamExt;
use serde_json::Value;

use agents_contracts::ui_stream::{
    ErrorChunk, FinishChunk, FinishReason as UiFinishReason, FinishStepChunk, ReasoningDeltaChunk,
    ReasoningEndChunk, ReasoningStartChunk, StartChunk, StartStepChunk, TextDeltaChunk,
    TextEndChunk, TextStartChunk, ToolInputAvailableChunk, ToolInputDeltaChunk,
    ToolInputErrorChunk, ToolInputStartChunk, ToolOutputAvailableChunk, ToolOutputErrorChunk,
    UI_MESSAGE_STREAM_DONE, UI_MESSAGE_STREAM_HEADERS, UiChunk, sse_frame,
};
use agents_core::assistant::wizard::{WizardContext, build_wizard_system_prompt};
use agents_core::org::OrgRole;
use agents_llm::client::{Cancel, stream_chat};
use agents_llm::provider::Provider;
use agents_llm::types::{
    ChatRequest, Event, FinishReason as LlmFinishReason, Message, Role, ToolCall,
};
use agents_store::catalog;

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::json::Body;

use super::wizard_bodies::{self, WizardRequest};
use super::wizard_tools::{self, Catalogues, ToolRun};
use super::{caller, missing_body, store_error};

/// How many model calls one turn may take. The old code stopped after eight steps
/// (`stepCountIs(MAX_STEPS)`).
const MAX_STEPS: usize = 8;

/// The id of the text part. The OpenAI-compatible provider names it `txt-0`.
const TEXT_ID: &str = "txt-0";

/// The id of the reasoning part. The OpenAI-compatible provider names it `reasoning-0`.
const REASONING_ID: &str = "reasoning-0";

/// `POST /api/assistants/wizard/stream` — the wizard's answer, as a UI message stream.
pub(super) async fn stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    body: Option<Body<Value>>,
) -> Result<Response, ApiError> {
    // The old route refused a caller without an organisation before it read the body.
    let caller = caller(&state, &headers, &user).await?;
    let org_id = caller.org()?.to_owned();
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let request = wizard_bodies::parse(&body)?;
    let role = caller
        .role
        .map(OrgRole::as_str)
        .unwrap_or("member")
        .to_owned();

    let catalogues = load_catalogues(&state, &org_id).await?;
    let system = build_wizard_system_prompt(&WizardContext {
        organization_id: org_id.clone(),
        user_role: role,
        existing_agent_count: count_of(catalogues.agent_count),
        tool_count: count(catalogues.tools.len()),
        skill_count: count(catalogues.skills.len()),
        mcp_count: count(catalogues.mcp_servers.len()),
        kb_count: count(catalogues.knowledge_groups.len()),
        model_count: count(catalogues.models.len()),
        is_free_plan: state.wizard.is_free_plan(&org_id),
    });

    let model_id = state.wizard.model_id().to_owned();
    let route = state.llm.route(&model_id).map_err(|error| {
        tracing::error!(error = %error, "the wizard has no model provider");
        ApiError::new(agents_contracts::error_codes::ErrorCode::Internal)
    })?;

    let turn = Turn {
        provider: route.provider,
        catalogues,
        chat: ChatRequest {
            model: route.model,
            // The wizard's prompt is the system message, the way `streamText({ system })`
            // sent it.
            messages: std::iter::once(Message::system(system))
                .chain(model_messages(&request))
                .collect(),
            tools: wizard_tools::definitions(),
            ..ChatRequest::default()
        },
    };

    // The answer is a stream, not a body: the turn runs in its own task and the frames go
    // to the client as they are written.
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);
    tokio::spawn(run_turn(turn, tx));
    let frames = futures::stream::unfold(rx, |mut rx| async move {
        rx.recv()
            .await
            .map(|frame| (Ok::<_, std::io::Error>(frame), rx))
    });

    let mut response = Response::builder().status(200);
    for (name, value) in UI_MESSAGE_STREAM_HEADERS {
        response = response.header(name, value);
    }
    response
        .body(AxumBody::from_stream(frames))
        .map_err(|_| ApiError::new(agents_contracts::error_codes::ErrorCode::Internal))
}

/// The wizard's turn: everything it needs, owned.
struct Turn {
    provider: Provider,
    catalogues: Catalogues,
    chat: ChatRequest,
}

/// The catalogues the wizard offers: the organisation's own and the global ones.
async fn load_catalogues(state: &AppState, org_id: &str) -> Result<Catalogues, ApiError> {
    let (tools, skills, mcp_servers, knowledge_groups, agents) = futures::future::join5(
        catalog::list_tools(&state.db, org_id),
        catalog::list_skills(&state.db, org_id),
        catalog::list_mcp_servers(&state.db, org_id),
        catalog::list_knowledge_groups(&state.db, org_id),
        catalog::count_assistants(&state.db, org_id),
    )
    .await;
    Ok(Catalogues {
        models: state.wizard.models(org_id),
        tools: tools.map_err(|e| store_error(&e))?,
        skills: skills.map_err(|e| store_error(&e))?,
        mcp_servers: mcp_servers.map_err(|e| store_error(&e))?,
        knowledge_groups: knowledge_groups.map_err(|e| store_error(&e))?,
        agent_count: agents.map_err(|e| store_error(&e))?,
    })
}

/// A count as the prompt wants it.
fn count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// A count from the database as the prompt wants it.
fn count_of(value: i64) -> u32 {
    u32::try_from(value).unwrap_or(0)
}

/// The conversation the caller sends, as model messages.
///
/// The system messages are dropped: the wizard's prompt is the system message, the way the
/// old code did it (`streamText({ system })`).
fn model_messages(request: &WizardRequest) -> Vec<Message> {
    request
        .messages
        .iter()
        .filter(|message| message.role == "user" || message.role == "assistant")
        .map(|message| {
            if message.role == "assistant" {
                Message::assistant(message.content.clone())
            } else {
                Message::user(message.content.clone())
            }
        })
        .collect()
}

/// Run the turn and write the frames.
///
/// A client that goes away stops the turn: the receiving half of the channel is the
/// response body, so when the client disconnects it is dropped, `tx.closed()` resolves and
/// the turn's future is dropped with the upstream stream in it, which closes the
/// connection to the model provider. Waiting for the next `send` to fail is not enough: a
/// model that is still writing a tool call's arguments sends nothing to the client.
async fn run_turn(turn: Turn, tx: tokio::sync::mpsc::Sender<String>) {
    tokio::select! {
        result = drive(turn, &tx) => {
            if let Err(Gone) = result {
                tracing::debug!("the wizard's client went away");
            }
        }
        () = tx.closed() => {
            tracing::debug!("the wizard's client went away; the model stream is dropped");
        }
    }
}

/// The client is gone: nothing more can be written.
struct Gone;

/// The turn: the model's steps, with the tools run between them.
async fn drive(turn: Turn, tx: &tokio::sync::mpsc::Sender<String>) -> Result<(), Gone> {
    let Turn {
        provider,
        catalogues,
        mut chat,
    } = turn;
    let client = agents_llm::client::default_client();

    send(
        tx,
        &UiChunk::Start(StartChunk {
            message_metadata: None,
            message_id: None,
        }),
    )
    .await?;

    let mut finish_reason = UiFinishReason::Other;
    for _step in 1..=MAX_STEPS {
        send(tx, &UiChunk::StartStep(StartStepChunk {})).await?;
        let mut stream = Box::pin(stream_chat(&client, &provider, &chat, Cancel::never()));
        let mut text = String::new();
        let mut text_open = false;
        let mut reasoning_open = false;
        let mut calls: Vec<ToolCall> = Vec::new();
        // The id of every call by its index: an argument fragment names only the index.
        let mut call_ids: Vec<(usize, String)> = Vec::new();
        let mut step_reason = LlmFinishReason::Other;
        while let Some(event) = stream.next().await {
            match event {
                Ok(Event::TextDelta { text: part }) => {
                    if !text_open {
                        text_open = true;
                        send(
                            tx,
                            &UiChunk::TextStart(TextStartChunk {
                                id: TEXT_ID.to_owned(),
                                provider_metadata: None,
                            }),
                        )
                        .await?;
                    }
                    text.push_str(&part);
                    send(
                        tx,
                        &UiChunk::TextDelta(TextDeltaChunk {
                            id: TEXT_ID.to_owned(),
                            delta: part,
                            provider_metadata: None,
                        }),
                    )
                    .await?;
                }
                Ok(Event::ReasoningDelta { text: part }) => {
                    if !reasoning_open {
                        reasoning_open = true;
                        send(
                            tx,
                            &UiChunk::ReasoningStart(ReasoningStartChunk {
                                id: REASONING_ID.to_owned(),
                                provider_metadata: None,
                            }),
                        )
                        .await?;
                    }
                    send(
                        tx,
                        &UiChunk::ReasoningDelta(ReasoningDeltaChunk {
                            id: REASONING_ID.to_owned(),
                            delta: part,
                            provider_metadata: None,
                        }),
                    )
                    .await?;
                }
                // The SDK forwards the provider's tool-input parts as they stream.
                Ok(Event::ToolCallStart { index, id, name }) => {
                    call_ids.push((index, id.clone()));
                    send(
                        tx,
                        &UiChunk::ToolInputStart(ToolInputStartChunk {
                            tool_call_id: id,
                            tool_name: name,
                            provider_executed: None,
                            provider_metadata: None,
                            dynamic: None,
                            title: None,
                        }),
                    )
                    .await?;
                }
                Ok(Event::ToolCallArgsDelta { index, delta }) => {
                    if let Some((_, id)) = call_ids.iter().find(|(i, _)| *i == index) {
                        send(
                            tx,
                            &UiChunk::ToolInputDelta(ToolInputDeltaChunk {
                                tool_call_id: id.clone(),
                                input_text_delta: delta,
                            }),
                        )
                        .await?;
                    }
                }
                Ok(Event::ToolCallReady { id, name, args }) => {
                    calls.push(ToolCall { id, name, args });
                }
                Ok(Event::Finish { reason }) => step_reason = reason,
                Ok(Event::Usage(_)) => {}
                Ok(Event::Error { message }) => {
                    send_error(tx, &message).await;
                    return Ok(());
                }
                Err(error) => {
                    // The provider's own words stay in the log; the client gets a fixed
                    // message.
                    tracing::warn!(error = %error, "the wizard's model failed");
                    send_error(tx, error.user_message()).await;
                    return Ok(());
                }
            }
        }
        finish_reason = ui_finish_reason(step_reason);
        if text_open {
            send(
                tx,
                &UiChunk::TextEnd(TextEndChunk {
                    id: TEXT_ID.to_owned(),
                    provider_metadata: None,
                }),
            )
            .await?;
        }
        if reasoning_open {
            send(
                tx,
                &UiChunk::ReasoningEnd(ReasoningEndChunk {
                    id: REASONING_ID.to_owned(),
                    provider_metadata: None,
                }),
            )
            .await?;
        }

        let results = run_tools(tx, &calls, &catalogues).await?;

        send(tx, &UiChunk::FinishStep(FinishStepChunk {})).await?;
        if calls.is_empty() {
            break;
        }
        // The model's own message and the tool results go back to it.
        chat.messages.push(Message {
            role: Role::Assistant,
            content: if text.is_empty() { None } else { Some(text) },
            name: None,
            tool_call_id: None,
            tool_calls: calls,
        });
        chat.messages.extend(results);
    }

    send(
        tx,
        &UiChunk::Finish(FinishChunk {
            // The reason of the last step, as `streamText` reports it.
            finish_reason: Some(finish_reason),
            message_metadata: None,
        }),
    )
    .await?;
    tx.send(UI_MESSAGE_STREAM_DONE.to_owned())
        .await
        .map_err(|_| Gone)
}

/// Run the tool calls of one step and write their chunks; returns the results for the
/// model.
///
/// A call whose arguments do not fit the tool is a `tool-input-error` followed by a
/// `tool-output-error`, both marked `dynamic`, the way the SDK reports an invalid call.
async fn run_tools(
    tx: &tokio::sync::mpsc::Sender<String>,
    calls: &[ToolCall],
    catalogues: &Catalogues,
) -> Result<Vec<Message>, Gone> {
    let mut results: Vec<Message> = Vec::new();
    for call in calls {
        match wizard_tools::run(&call.name, &call.args, catalogues) {
            ToolRun::Ran { input, output } => {
                send(
                    tx,
                    &UiChunk::ToolInputAvailable(ToolInputAvailableChunk {
                        tool_call_id: call.id.clone(),
                        tool_name: call.name.clone(),
                        input,
                        provider_executed: None,
                        provider_metadata: None,
                        dynamic: None,
                        title: None,
                    }),
                )
                .await?;
                send(
                    tx,
                    &UiChunk::ToolOutputAvailable(ToolOutputAvailableChunk {
                        tool_call_id: call.id.clone(),
                        output: output.clone(),
                        provider_executed: None,
                        preliminary: None,
                        dynamic: None,
                    }),
                )
                .await?;
                results.push(Message::tool_result(call, output_text(&output)));
            }
            ToolRun::Invalid { input, error } => {
                send(
                    tx,
                    &UiChunk::ToolInputError(ToolInputErrorChunk {
                        tool_call_id: call.id.clone(),
                        tool_name: call.name.clone(),
                        input,
                        provider_executed: None,
                        provider_metadata: None,
                        dynamic: Some(true),
                        error_text: error.clone(),
                        title: None,
                    }),
                )
                .await?;
                send(
                    tx,
                    &UiChunk::ToolOutputError(ToolOutputErrorChunk {
                        tool_call_id: call.id.clone(),
                        error_text: error.clone(),
                        provider_executed: None,
                        dynamic: Some(true),
                    }),
                )
                .await?;
                results.push(Message::tool_result(call, error));
            }
        }
    }
    Ok(results)
}

/// A step's finish reason, as the UI stream names it.
fn ui_finish_reason(reason: LlmFinishReason) -> UiFinishReason {
    match reason {
        LlmFinishReason::Stop => UiFinishReason::Stop,
        LlmFinishReason::Length => UiFinishReason::Length,
        LlmFinishReason::ToolCalls => UiFinishReason::ToolCalls,
        LlmFinishReason::ContentFilter => UiFinishReason::ContentFilter,
        LlmFinishReason::Other => UiFinishReason::Other,
    }
}

/// The text of a tool's output, the way it goes back to the model.
fn output_text(output: &Value) -> String {
    serde_json::to_string(output).unwrap_or_else(|_| "{}".to_owned())
}

/// Write one chunk.
async fn send(tx: &tokio::sync::mpsc::Sender<String>, chunk: &UiChunk) -> Result<(), Gone> {
    tx.send(sse_frame(chunk)).await.map_err(|_| Gone)
}

/// Write the error the client sees.
async fn send_error(tx: &tokio::sync::mpsc::Sender<String>, message: &str) {
    let chunk = UiChunk::Error(ErrorChunk {
        error_text: message.to_owned(),
    });
    let _ = tx.send(sse_frame(&chunk)).await;
    let _ = tx.send(UI_MESSAGE_STREAM_DONE.to_owned()).await;
}
