//! One request through the router, with a body, extra headers and a peer address.
//!
//! `common::send` answers JSON; the agent API answers an event stream and reads the client's
//! address for the IP allowlist, so the tests need the status, the headers, the raw text and a
//! way to say where the request came from.

#![allow(dead_code, reason = "the two agent API test files use parts of it")]

use std::net::SocketAddr;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::header::AUTHORIZATION;
use axum::http::{HeaderMap, Request, Response};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

/// What came back.
pub struct Answer {
    pub status: u16,
    pub headers: HeaderMap,
    pub text: String,
}

impl Answer {
    /// The body as JSON (`Value::Null` when it is not JSON).
    pub fn json(&self) -> Value {
        serde_json::from_str(&self.text).unwrap_or(Value::Null)
    }

    /// The value of one header.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|value| value.to_str().ok())
    }
}

/// Sends one request. `bearer` is the API key when it is a key, a user token otherwise; the
/// caller decides by putting it in `headers` itself.
pub async fn send(
    router: &Router,
    method: &str,
    uri: &str,
    headers: &[(&str, String)],
    body: Option<Value>,
    peer: Option<SocketAddr>,
) -> Result<Answer, String> {
    let mut request = Request::builder().method(method).uri(uri);
    for (name, value) in headers {
        request = request.header(*name, value);
    }
    let request = match body {
        Some(body) => request
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_vec(&body).map_err(|error| error.to_string())?,
            ))
            .map_err(|error| error.to_string())?,
        None => request
            .body(Body::empty())
            .map_err(|error| error.to_string())?,
    };
    let mut request = request;
    if let Some(peer) = peer {
        request.extensions_mut().insert(ConnectInfo(peer));
    }
    let response: Response<Body> = router
        .clone()
        .oneshot(request)
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    let bytes = response
        .into_body()
        .collect()
        .await
        .map_err(|error| error.to_string())?
        .to_bytes();
    Ok(Answer {
        status,
        headers,
        text: String::from_utf8_lossy(&bytes).to_string(),
    })
}

/// Sends one request and answers the response with its body still unread, so a test can read
/// part of a stream and then hang up.
pub async fn open(
    router: &Router,
    uri: &str,
    headers: &[(&str, String)],
    body: &Value,
    peer: SocketAddr,
) -> Result<Response<Body>, String> {
    let mut request = Request::builder().method("POST").uri(uri);
    for (name, value) in headers {
        request = request.header(*name, value);
    }
    let mut request = request
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_vec(body).map_err(|error| error.to_string())?,
        ))
        .map_err(|error| error.to_string())?;
    request.extensions_mut().insert(ConnectInfo(peer));
    router
        .clone()
        .oneshot(request)
        .await
        .map_err(|error| error.to_string())
}

/// `Bearer <api key>`.
pub fn bearer(key: &str) -> (&'static str, String) {
    (AUTHORIZATION.as_str(), format!("Bearer {key}"))
}

/// An `Authorization` value that already carries its scheme (`common::bearer` builds one).
pub fn authorization(value: &str) -> (&'static str, String) {
    (AUTHORIZATION.as_str(), value.to_owned())
}

/// The frames of an event stream, as their JSON values.
pub fn frames(text: &str) -> Vec<Value> {
    text.split("\n\n")
        .filter(|frame| !frame.trim().is_empty())
        .map(|frame| {
            let payload = frame.strip_prefix("data: ").unwrap_or(frame);
            if payload == "[DONE]" {
                return Value::String("[DONE]".to_owned());
            }
            serde_json::from_str(payload).unwrap_or(Value::Null)
        })
        .collect()
}
