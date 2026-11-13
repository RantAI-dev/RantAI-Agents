//! One id per request: the caller's `X-Request-Id` when safe to echo, otherwise a new one. It is
//! put on every response and in every error body, and is available to handlers via [`current`].

use std::sync::atomic::{AtomicU64, Ordering};

use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;

use super::api_error::sent_request_id;

tokio::task_local! {
    static REQUEST_ID: String;
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn new_id() -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    format!("req_{t:x}_{n:x}")
}

/// The current request's id, or a fresh one outside a request.
#[must_use]
pub fn current() -> String {
    REQUEST_ID
        .try_with(Clone::clone)
        .unwrap_or_else(|_| new_id())
}

pub async fn middleware(req: Request, next: Next) -> Response {
    let id = sent_request_id(req.headers()).map_or_else(new_id, str::to_owned);
    let mut res = REQUEST_ID.scope(id.clone(), next.run(req)).await;
    if let Ok(v) = HeaderValue::from_str(&id) {
        res.headers_mut().insert("x-request-id", v);
    }
    res
}
