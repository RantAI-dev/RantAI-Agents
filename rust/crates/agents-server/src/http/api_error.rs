//! The one place that turns an error into a response. Copy it beside the generated
//! `error_codes.rs` (see `.agents/error-codes.tsv`) and have every handler return through it.
//! Written for axum; it needs `axum`, `serde` and `serde_json`.

use axum::Json;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Serialize;

use agents_contracts::error_codes::ErrorCode;
use agents_core::validation::FieldError as CoreFieldError;

#[derive(Debug, Clone, Serialize)]
pub struct FieldError {
    /// A JSON Pointer into the body (`/items/0/quantity`), or the name of a query or path parameter.
    pub field: String,
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct ApiError {
    pub code: ErrorCode,
    message: Option<String>,
    errors: Vec<FieldError>,
    retry_after_seconds: Option<u64>,
}

#[derive(Serialize)]
struct Body<'a> {
    error: Inner<'a>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Inner<'a> {
    code: &'static str,
    message: &'a str,
    request_id: &'a str,
    #[serde(skip_serializing_if = "<[FieldError]>::is_empty")]
    errors: &'a [FieldError],
}

impl ApiError {
    #[must_use]
    pub const fn new(code: ErrorCode) -> Self {
        Self {
            code,
            message: None,
            errors: Vec::new(),
            retry_after_seconds: None,
        }
    }

    /// A more specific sentence than the registry's. Never pass `err.to_string()` here: log it.
    #[must_use]
    pub fn message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }

    /// The bad fields, when there are any.
    #[must_use]
    pub fn errors(&self) -> &[FieldError] {
        &self.errors
    }

    /// Every bad field, not only the first.
    #[must_use]
    pub fn invalid(errors: Vec<FieldError>) -> Self {
        Self {
            errors,
            ..Self::new(ErrorCode::InvalidRequest)
        }
    }

    #[must_use]
    pub const fn retry_after(mut self, seconds: u64) -> Self {
        self.retry_after_seconds = Some(seconds);
        self
    }

    #[must_use]
    pub fn into_response(self, request_id: &str) -> Response {
        let status =
            StatusCode::from_u16(self.code.status()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        // A 5xx never carries a caller-supplied sentence: the cause belongs in the log.
        let message = match &self.message {
            Some(text) if !status.is_server_error() => text.as_str(),
            _ => self.code.message(),
        };
        let mut headers = HeaderMap::new();
        if let Ok(value) = HeaderValue::from_str(request_id) {
            headers.insert("x-request-id", value);
        }
        if status == StatusCode::UNAUTHORIZED {
            headers.insert(header::WWW_AUTHENTICATE, HeaderValue::from_static("Bearer"));
        }
        if let Some(seconds) = self.retry_after_seconds {
            headers.insert(header::RETRY_AFTER, HeaderValue::from(seconds));
        }
        let body = Body {
            error: Inner {
                code: self.code.as_str(),
                message,
                request_id,
                errors: &self.errors,
            },
        };
        (status, headers, Json(body)).into_response()
    }
}

/// The caller's `X-Request-Id` when it is safe to echo, otherwise `None`: make a UUID then.
#[must_use]
pub fn sent_request_id(headers: &HeaderMap) -> Option<&str> {
    let sent = headers.get("x-request-id")?.to_str().ok()?;
    let safe = (1..=128).contains(&sent.len())
        && sent
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'));
    safe.then_some(sent)
}

impl From<Vec<CoreFieldError>> for ApiError {
    fn from(errors: Vec<CoreFieldError>) -> Self {
        Self::invalid(
            errors
                .into_iter()
                .map(|e| FieldError {
                    field: e.field,
                    code: e.code,
                    message: e.message,
                })
                .collect(),
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let id = super::request_id::current();
        ApiError::into_response(self, &id)
    }
}
