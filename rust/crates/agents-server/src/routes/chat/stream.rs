//! The response: the AI SDK v6 UI message stream, frame by frame.
//!
//! Old: `result.toUIMessageStreamResponse(...)` in `src/features/chat-public/service.ts`. The
//! frames are the ones the `ai` package writes (`JsonToSseTransformStream`), so the client
//! (`@ai-sdk/react` 3.0.41) reads them as it reads the TypeScript ones:
//!
//! ```text
//! start → start-step → text-start → text-delta… → text-end → finish-step → finish → [DONE]
//! ```
//!
//! The reasoning part is opened with the first reasoning delta and closed after the `finish`
//! frame, the way the old `createExtractThinkTransform` did.

use std::collections::BTreeMap;

use agents_contracts::ui_stream::{
    ErrorChunk, FinishChunk, FinishReason, FinishStepChunk, ReasoningDeltaChunk, ReasoningEndChunk,
    ReasoningStartChunk, StartChunk, StartStepChunk, TextDeltaChunk, TextEndChunk, TextStartChunk,
    ToolInputAvailableChunk, ToolInputDeltaChunk, ToolInputStartChunk, ToolOutputAvailableChunk,
    UI_MESSAGE_STREAM_DONE, UiChunk, sse_frame,
};
use agents_llm::agent_loop::AgentEvent;
use agents_llm::types::{Event, LlmError, Usage};
use axum::body::Bytes;

/// The id of the text part. The OpenAI-compatible provider names it `txt-0`.
const TEXT_PART_ID: &str = "txt-0";

/// The frames of one chat, and what the chat produced.
#[derive(Debug, Default)]
pub struct Frames {
    /// The answer, as the model wrote it.
    pub text: String,
    /// The reasoning, as the model wrote it.
    pub reasoning: String,
    /// What the model reported the chat cost.
    pub usage: Usage,
    finish_reason: Option<FinishReason>,
    text_open: bool,
    reasoning_open: bool,
    reasoning_id: Option<String>,
    /// The tool calls of the step, by their index: the id the client knows them by.
    calls: BTreeMap<usize, String>,
    /// Whether a step is still running.
    step_open: bool,
    /// Whether a step has begun but has not said anything yet. The SDK writes the
    /// `start-step` frame when the first chunk of the step arrives, so a step that fails
    /// before its first chunk never writes one.
    step_pending: bool,
    failed: bool,
}

impl Frames {
    /// A chat that has not started yet.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The frames one event of the model produces.
    pub fn on_event(&mut self, event: AgentEvent) -> Vec<Bytes> {
        match event {
            AgentEvent::StepStart { .. } => {
                self.step_open = true;
                self.step_pending = true;
                Vec::new()
            }
            AgentEvent::Model(model) => {
                let mut frames = self.step_frame();
                frames.extend(self.on_model_event(model));
                frames
            }
            AgentEvent::ToolResult { id, content, .. } => {
                vec![frame(&UiChunk::ToolOutputAvailable(
                    ToolOutputAvailableChunk {
                        tool_call_id: id,
                        output: tool_output(&content),
                        provider_executed: None,
                        preliminary: None,
                        dynamic: None,
                    },
                ))]
            }
            AgentEvent::StepFinish { usage, .. } => {
                self.usage = usage;
                self.step_open = false;
                let mut frames = self.step_frame();
                if self.text_open {
                    self.text_open = false;
                    frames.push(frame(&UiChunk::TextEnd(TextEndChunk {
                        id: TEXT_PART_ID.to_owned(),
                        provider_metadata: None,
                    })));
                }
                frames.push(frame(&UiChunk::FinishStep(FinishStepChunk {})));
                frames
            }
            AgentEvent::TotalUsage { usage } => {
                self.usage = usage;
                Vec::new()
            }
            AgentEvent::ApprovalRequired { name, reason, .. } => self.on_error(&format!(
                "The tool {name} needs a decision before it can run: {reason}"
            )),
        }
    }

    /// The frames the model itself produced.
    fn on_model_event(&mut self, event: Event) -> Vec<Bytes> {
        match event {
            Event::TextDelta { text } => {
                self.text.push_str(&text);
                let mut frames = Vec::new();
                if !self.text_open {
                    self.text_open = true;
                    frames.push(frame(&UiChunk::TextStart(TextStartChunk {
                        id: TEXT_PART_ID.to_owned(),
                        provider_metadata: None,
                    })));
                }
                frames.push(frame(&UiChunk::TextDelta(TextDeltaChunk {
                    id: TEXT_PART_ID.to_owned(),
                    delta: text,
                    provider_metadata: None,
                })));
                frames
            }
            Event::ReasoningDelta { text } => {
                self.reasoning.push_str(&text);
                let mut frames = Vec::new();
                if !self.reasoning_open {
                    self.reasoning_open = true;
                    let id = agents_store::new_id();
                    self.reasoning_id = Some(id.clone());
                    frames.push(frame(&UiChunk::ReasoningStart(ReasoningStartChunk {
                        id: id.clone(),
                        provider_metadata: None,
                    })));
                }
                let id = self
                    .reasoning_id
                    .clone()
                    .unwrap_or_else(|| agents_store::new_id());
                frames.push(frame(&UiChunk::ReasoningDelta(ReasoningDeltaChunk {
                    id,
                    delta: text,
                    provider_metadata: None,
                })));
                frames
            }
            Event::ToolCallStart { index, id, name } => {
                self.calls.insert(index, id.clone());
                vec![frame(&UiChunk::ToolInputStart(ToolInputStartChunk {
                    tool_call_id: id,
                    tool_name: name,
                    provider_executed: None,
                    provider_metadata: None,
                    dynamic: None,
                    title: None,
                }))]
            }
            Event::ToolCallArgsDelta { index, delta } => {
                let id = self.calls.get(&index).cloned().unwrap_or_default();
                vec![frame(&UiChunk::ToolInputDelta(ToolInputDeltaChunk {
                    tool_call_id: id,
                    input_text_delta: delta,
                }))]
            }
            Event::ToolCallReady { id, name, args } => {
                vec![frame(&UiChunk::ToolInputAvailable(
                    ToolInputAvailableChunk {
                        tool_call_id: id,
                        tool_name: name,
                        input: args,
                        provider_executed: None,
                        provider_metadata: None,
                        dynamic: None,
                        title: None,
                    },
                ))]
            }
            Event::Usage(usage) => {
                self.usage = usage;
                Vec::new()
            }
            Event::Finish { reason } => {
                self.finish_reason = Some(map_finish_reason(reason));
                Vec::new()
            }
            Event::Error { message } => self.on_error(&message),
        }
    }

    /// The `start-step` frame, when the step has not written it yet.
    fn step_frame(&mut self) -> Vec<Bytes> {
        if !self.step_pending {
            return Vec::new();
        }
        self.step_pending = false;
        vec![frame(&UiChunk::StartStep(StartStepChunk {}))]
    }

    /// The frames an upstream failure produces: the error chunk, and nothing else.
    ///
    /// The old code mapped the failure with a regex over the upstream wording; the port picks
    /// the message by the status the provider answered with (docs/port/differences.md, row 12).
    pub fn on_error(&mut self, message: &str) -> Vec<Bytes> {
        self.failed = true;
        vec![frame(&UiChunk::Error(ErrorChunk {
            error_text: message.to_owned(),
        }))]
    }

    /// The frames that close the stream.
    pub fn close(&mut self) -> Vec<Bytes> {
        let mut frames = Vec::new();
        if !self.failed {
            if self.text_open {
                self.text_open = false;
                frames.push(frame(&UiChunk::TextEnd(TextEndChunk {
                    id: TEXT_PART_ID.to_owned(),
                    provider_metadata: None,
                })));
            }
            if self.step_open {
                self.step_open = false;
                frames.push(frame(&UiChunk::FinishStep(FinishStepChunk {})));
            }
            frames.push(frame(&UiChunk::Finish(FinishChunk {
                finish_reason: Some(self.finish_reason.unwrap_or(FinishReason::Stop)),
                message_metadata: None,
            })));
        }
        if self.reasoning_open {
            self.reasoning_open = false;
            let id = self
                .reasoning_id
                .clone()
                .unwrap_or_else(|| agents_store::new_id());
            frames.push(frame(&UiChunk::ReasoningEnd(ReasoningEndChunk {
                id,
                provider_metadata: None,
            })));
        }
        frames.push(Bytes::from_static(UI_MESSAGE_STREAM_DONE.as_bytes()));
        frames
    }

    /// The frames that open the stream.
    #[must_use]
    pub fn start() -> Vec<Bytes> {
        vec![frame(&UiChunk::Start(StartChunk {
            message_metadata: None,
            message_id: None,
        }))]
    }
}

/// One frame: `data: {json}\n\n`, the way `JsonToSseTransformStream` writes it.
fn frame(chunk: &UiChunk) -> Bytes {
    Bytes::from(sse_frame(chunk))
}

/// The tool's result, as the client reads it: the JSON the tool returned, or the text.
fn tool_output(content: &str) -> serde_json::Value {
    serde_json::from_str(content).unwrap_or_else(|_| serde_json::Value::String(content.to_owned()))
}

/// The reason the model stopped, in the names the UI stream uses.
fn map_finish_reason(reason: agents_llm::types::FinishReason) -> FinishReason {
    match reason {
        agents_llm::types::FinishReason::Stop => FinishReason::Stop,
        agents_llm::types::FinishReason::Length => FinishReason::Length,
        agents_llm::types::FinishReason::ToolCalls => FinishReason::ToolCalls,
        agents_llm::types::FinishReason::ContentFilter => FinishReason::ContentFilter,
        agents_llm::types::FinishReason::Other => FinishReason::Other,
    }
}

/// The message a failure shows the user. The provider's own words never reach the user.
#[must_use]
pub fn error_message(error: &LlmError) -> String {
    error.user_message().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use agents_llm::types::FinishReason as ModelFinishReason;

    fn text_of(frames: &[Bytes]) -> Vec<String> {
        frames
            .iter()
            .map(|frame| String::from_utf8_lossy(frame).to_string())
            .collect()
    }

    #[test]
    fn the_frames_of_a_plain_answer_are_the_ones_the_sdk_writes() {
        let mut frames = Frames::new();
        let mut out = text_of(&Frames::start());
        out.extend(text_of(&frames.on_event(AgentEvent::StepStart { step: 1 })));
        out.extend(text_of(&frames.on_event(AgentEvent::Model(
            Event::TextDelta {
                text: "Hello".to_owned(),
            },
        ))));
        out.extend(text_of(&frames.on_event(AgentEvent::Model(
            Event::TextDelta {
                text: " world".to_owned(),
            },
        ))));
        out.extend(text_of(&frames.on_event(AgentEvent::Model(
            Event::Finish {
                reason: ModelFinishReason::Stop,
            },
        ))));
        out.extend(text_of(&frames.on_event(AgentEvent::StepFinish {
            step: 1,
            usage: Usage::default(),
        })));
        out.extend(text_of(&frames.close()));

        assert_eq!(
            out,
            vec![
                "data: {\"type\":\"start\"}\n\n",
                "data: {\"type\":\"start-step\"}\n\n",
                "data: {\"type\":\"text-start\",\"id\":\"txt-0\"}\n\n",
                "data: {\"type\":\"text-delta\",\"id\":\"txt-0\",\"delta\":\"Hello\"}\n\n",
                "data: {\"type\":\"text-delta\",\"id\":\"txt-0\",\"delta\":\" world\"}\n\n",
                "data: {\"type\":\"text-end\",\"id\":\"txt-0\"}\n\n",
                "data: {\"type\":\"finish-step\"}\n\n",
                "data: {\"type\":\"finish\",\"finishReason\":\"stop\"}\n\n",
                "data: [DONE]\n\n",
            ]
        );
    }

    #[test]
    fn the_reasoning_is_opened_once_and_closed_after_the_finish() {
        let mut frames = Frames::new();
        let mut out = text_of(&Frames::start());
        out.extend(text_of(&frames.on_event(AgentEvent::StepStart { step: 1 })));
        out.extend(text_of(&frames.on_event(AgentEvent::Model(
            Event::ReasoningDelta {
                text: "hmm".to_owned(),
            },
        ))));
        out.extend(text_of(&frames.on_event(AgentEvent::Model(
            Event::TextDelta {
                text: "the answer".to_owned(),
            },
        ))));
        out.extend(text_of(&frames.on_event(AgentEvent::StepFinish {
            step: 1,
            usage: Usage::default(),
        })));
        out.extend(text_of(&frames.close()));

        let joined = out.join("");
        assert!(joined.contains("\"type\":\"reasoning-start\""));
        assert!(joined.contains("\"delta\":\"hmm\""));
        assert!(joined.contains("\"type\":\"reasoning-end\""));
        // The reasoning ends after the finish frame.
        let finish = joined.find("\"type\":\"finish\"").unwrap_or(0);
        let reasoning_end = joined.find("\"type\":\"reasoning-end\"").unwrap_or(0);
        assert!(reasoning_end > finish);
    }

    #[test]
    fn a_failure_is_the_error_frame_and_nothing_else() {
        let mut frames = Frames::new();
        let mut out = text_of(&Frames::start());
        out.extend(text_of(
            &frames.on_error("The model didn't return a response."),
        ));
        out.extend(text_of(&frames.close()));
        assert_eq!(
            out,
            vec![
                "data: {\"type\":\"start\"}\n\n",
                "data: {\"type\":\"error\",\"errorText\":\"The model didn't return a response.\"}\n\n",
                "data: [DONE]\n\n",
            ]
        );
    }
}
