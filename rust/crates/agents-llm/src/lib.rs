//! A streaming client for OpenAI-compatible chat completions (OpenRouter, MiniMax) and the
//! multi-step tool loop.
//!
//! Ported from `src/lib/llm/provider.ts` and the `streamText` call in
//! `src/features/chat-public/service.ts`. The Vercel AI SDK did the message conversion, the step
//! loop and the `<think>` extraction for the old code; here they are explicit and tested.
//!
//! Nothing here reads the environment or the database. The caller builds the [`provider::Provider`]
//! (with [`provider::route`]) and the [`types::ChatRequest`], owns the [`client::Cancel`] signal
//! and decides what a tool does.

pub mod agent_loop;
pub mod client;
pub mod provider;
pub mod sse;
pub mod types;

pub use agent_loop::{AgentEvent, ToolExecutor, ToolOutcome};
pub use client::{Cancel, CancelHandle};
pub use provider::{Provider, ProviderConfig, Route};
pub use types::{
    ChatRequest, Event, FinishReason, LlmError, Message, ReasoningEffort, ResponseFormat, Role,
    ToolCall, ToolChoice, ToolDefinition, Usage,
};
