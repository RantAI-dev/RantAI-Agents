//! The multi-step loop: call the model, run the tools it asked for, call it again.
//!
//! The AI SDK did this with `stopWhen: stepCountIs(n)`: a step is one model call, the tools it
//! asked for run inside that step, and their results go back to the model as `tool` messages.
//! The loop here does the same and says where the steps begin and end, so the server can write
//! the `start-step` and `finish-step` frames.

use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;

use futures::{Stream, StreamExt};

use crate::client::{Cancel, stream_chat};
use crate::provider::Provider;
use crate::types::{ChatRequest, Event, LlmError, Message, Role, ToolCall, Usage};

/// What running a tool produced.
#[derive(Debug, Clone, PartialEq)]
pub enum ToolOutcome {
    /// The tool ran. The content goes back to the model.
    Completed {
        /// What the tool returned.
        content: String,
    },
    /// The tool failed. The message goes back to the model.
    Failed {
        /// What went wrong.
        message: String,
    },
    /// The tool needs a human decision before it can run. The caller handles it: the loop stops
    /// and the turn continues once the decision is made.
    NeedsApproval {
        /// Why the tool is waiting.
        reason: String,
    },
}

/// Runs the tools the model asks for.
///
/// The trait is object safe on purpose: the server keeps one registry of tools and hands the
/// loop a reference to it.
pub trait ToolExecutor: Send + Sync {
    /// Run one tool call.
    fn execute<'a>(
        &'a self,
        call: &'a ToolCall,
    ) -> Pin<Box<dyn Future<Output = ToolOutcome> + Send + 'a>>;
}

/// What the loop tells the caller.
#[derive(Debug, Clone, PartialEq)]
pub enum AgentEvent {
    /// A model step is about to start.
    StepStart {
        /// Which step, counting from one.
        step: usize,
    },
    /// Something the model did.
    Model(Event),
    /// A tool finished; its result goes back to the model.
    ToolResult {
        /// The call the result answers.
        id: String,
        /// The tool's name.
        name: String,
        /// What the tool returned.
        content: String,
    },
    /// A tool needs a human decision; the loop stopped.
    ApprovalRequired {
        /// The call that is waiting.
        id: String,
        /// The tool's name.
        name: String,
        /// Why the tool is waiting.
        reason: String,
    },
    /// A step finished.
    StepFinish {
        /// Which step.
        step: usize,
        /// What the step cost.
        usage: Usage,
    },
    /// What every step cost together.
    TotalUsage {
        /// The sum of every step's usage.
        usage: Usage,
    },
}

/// What the loop is doing.
enum Phase<'a> {
    /// No step is running.
    Idle,
    /// The model is streaming.
    Streaming {
        stream: Pin<Box<dyn Stream<Item = Result<Event, LlmError>> + Send + 'a>>,
        text: String,
        calls: Vec<ToolCall>,
        usage: Usage,
    },
    /// The tools of the step that just finished are running.
    Tools {
        pending: VecDeque<ToolCall>,
        results: Vec<Message>,
    },
    /// The turn is over.
    Finished,
}

/// The state of one turn.
struct LoopState<'a> {
    client: &'a reqwest::Client,
    provider: &'a Provider,
    request: ChatRequest,
    executor: &'a dyn ToolExecutor,
    max_steps: usize,
    cancel: Cancel,
    step: usize,
    step_usage: Usage,
    total_usage: Usage,
    events: VecDeque<Result<AgentEvent, LlmError>>,
    phase: Phase<'a>,
}

impl<'a> LoopState<'a> {
    /// The next event, or `None` when the turn is over.
    async fn next_event(&mut self) -> Option<Result<AgentEvent, LlmError>> {
        loop {
            if let Some(event) = self.events.pop_front() {
                return Some(event);
            }
            if matches!(self.phase, Phase::Finished) {
                return None;
            }
            let phase = std::mem::replace(&mut self.phase, Phase::Finished);
            let next = match phase {
                Phase::Finished => Phase::Finished,
                Phase::Idle => self.start_step(),
                Phase::Streaming {
                    stream,
                    text,
                    calls,
                    usage,
                } => self.continue_step(stream, text, calls, usage).await,
                Phase::Tools { pending, results } => self.continue_tools(pending, results).await,
            };
            self.phase = next;
        }
    }

    /// Start the next model call.
    fn start_step(&mut self) -> Phase<'a> {
        if self.cancel.is_cancelled() {
            self.events.push_back(Err(LlmError::Cancelled));
            return Phase::Finished;
        }
        self.step += 1;
        self.events
            .push_back(Ok(AgentEvent::StepStart { step: self.step }));
        let stream = stream_chat(
            self.client,
            self.provider,
            &self.request,
            self.cancel.clone(),
        );
        Phase::Streaming {
            stream: Box::pin(stream),
            text: String::new(),
            calls: Vec::new(),
            usage: Usage::default(),
        }
    }

    /// Take the next thing the model said.
    async fn continue_step(
        &mut self,
        mut stream: Pin<Box<dyn Stream<Item = Result<Event, LlmError>> + Send + 'a>>,
        mut text: String,
        mut calls: Vec<ToolCall>,
        mut usage: Usage,
    ) -> Phase<'a> {
        match stream.next().await {
            Some(Ok(event)) => {
                match &event {
                    Event::TextDelta { text: part } => text.push_str(part),
                    Event::ToolCallReady { id, name, args } => {
                        calls.push(ToolCall {
                            id: id.clone(),
                            name: name.clone(),
                            args: args.clone(),
                        });
                    }
                    Event::Usage(step_usage) => usage = *step_usage,
                    _ => {}
                }
                self.events.push_back(Ok(AgentEvent::Model(event)));
                Phase::Streaming {
                    stream,
                    text,
                    calls,
                    usage,
                }
            }
            Some(Err(error)) => {
                self.events.push_back(Err(error));
                Phase::Finished
            }
            None => {
                self.step_usage = usage;
                self.total_usage.add(usage);
                if calls.is_empty() {
                    self.events.push_back(Ok(AgentEvent::StepFinish {
                        step: self.step,
                        usage,
                    }));
                    self.events.push_back(Ok(AgentEvent::TotalUsage {
                        usage: self.total_usage,
                    }));
                    return Phase::Finished;
                }
                // The assistant asked for tools: its own message goes back with the results.
                self.request.messages.push(Message {
                    role: Role::Assistant,
                    content: if text.is_empty() { None } else { Some(text) },
                    name: None,
                    tool_call_id: None,
                    tool_calls: calls.clone(),
                });
                Phase::Tools {
                    pending: calls.into(),
                    results: Vec::new(),
                }
            }
        }
    }

    /// Run the tools of the step that just finished.
    async fn continue_tools(
        &mut self,
        mut pending: VecDeque<ToolCall>,
        mut results: Vec<Message>,
    ) -> Phase<'a> {
        let Some(call) = pending.pop_front() else {
            // Every tool ran: the results go back to the model.
            for message in results {
                self.request.messages.push(message);
            }
            self.events.push_back(Ok(AgentEvent::StepFinish {
                step: self.step,
                usage: self.step_usage,
            }));
            if self.step >= self.max_steps {
                self.events.push_back(Ok(AgentEvent::TotalUsage {
                    usage: self.total_usage,
                }));
                return Phase::Finished;
            }
            return Phase::Idle;
        };

        let executor = self.executor;
        let outcome = executor.execute(&call).await;
        match outcome {
            ToolOutcome::Completed { content } => {
                results.push(Message::tool_result(&call, content.clone()));
                self.events.push_back(Ok(AgentEvent::ToolResult {
                    id: call.id.clone(),
                    name: call.name.clone(),
                    content,
                }));
            }
            ToolOutcome::Failed { message } => {
                results.push(Message::tool_result(&call, message.clone()));
                self.events.push_back(Ok(AgentEvent::ToolResult {
                    id: call.id.clone(),
                    name: call.name.clone(),
                    content: message,
                }));
            }
            ToolOutcome::NeedsApproval { reason } => {
                self.events.push_back(Ok(AgentEvent::ApprovalRequired {
                    id: call.id.clone(),
                    name: call.name.clone(),
                    reason,
                }));
                self.events.push_back(Ok(AgentEvent::StepFinish {
                    step: self.step,
                    usage: self.step_usage,
                }));
                self.events.push_back(Ok(AgentEvent::TotalUsage {
                    usage: self.total_usage,
                }));
                return Phase::Finished;
            }
        }
        Phase::Tools { pending, results }
    }
}

/// Run the turn: model, tools, model again, until the model answers or the step limit is hit.
///
/// The tools of the last step still run, the way the AI SDK did it: the results are simply not
/// sent back to the model.
pub fn run_agent_loop<'a>(
    client: &'a reqwest::Client,
    provider: &'a Provider,
    request: ChatRequest,
    executor: &'a dyn ToolExecutor,
    max_steps: usize,
    cancel: Cancel,
) -> impl Stream<Item = Result<AgentEvent, LlmError>> + Send + use<'a> {
    let state = LoopState {
        client,
        provider,
        request,
        executor,
        max_steps: max_steps.max(1),
        cancel,
        step: 0,
        step_usage: Usage::default(),
        total_usage: Usage::default(),
        events: VecDeque::new(),
        phase: Phase::Idle,
    };
    futures::stream::unfold(state, |mut state| async move {
        state.next_event().await.map(|event| (event, state))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Nothing;

    impl ToolExecutor for Nothing {
        fn execute<'a>(
            &'a self,
            _call: &'a ToolCall,
        ) -> Pin<Box<dyn Future<Output = ToolOutcome> + Send + 'a>> {
            Box::pin(async {
                ToolOutcome::Completed {
                    content: String::new(),
                }
            })
        }
    }

    #[test]
    fn a_turn_with_no_steps_still_has_one() {
        let client = reqwest::Client::new();
        let provider = Provider::new("http://127.0.0.1:1/v1", "key");
        let executor = Nothing;
        let stream = run_agent_loop(
            &client,
            &provider,
            ChatRequest::default(),
            &executor,
            0,
            Cancel::never(),
        );
        drop(stream);
    }
}
