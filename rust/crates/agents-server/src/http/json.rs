//! A JSON body extractor whose rejections use the standard error body. Use it instead of
//! `axum::Json` for request bodies; `axum::Json` is still right for responses.

use axum::extract::rejection::JsonRejection;
use axum::extract::{FromRequest, OptionalFromRequest, Request};
use serde::de::DeserializeOwned;

use agents_contracts::error_codes::ErrorCode;
use agents_core::validation::FieldError;

use super::ApiError;

pub struct Body<T>(pub T);

fn reject(r: &JsonRejection) -> ApiError {
    match r {
        JsonRejection::MissingJsonContentType(_) => ApiError::new(ErrorCode::UnsupportedMediaType),
        JsonRejection::JsonDataError(e) => {
            ApiError::from(vec![FieldError::new("", "invalid_shape", e.body_text())])
        }
        JsonRejection::JsonSyntaxError(_) => {
            ApiError::new(ErrorCode::InvalidRequest).message("The body is not valid JSON.")
        }
        _ => ApiError::new(ErrorCode::InvalidRequest),
    }
}

impl<S, T> FromRequest<S> for Body<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, ApiError> {
        <axum::Json<T> as FromRequest<S>>::from_request(req, state)
            .await
            .map(|axum::Json(v)| Self(v))
            .map_err(|e| reject(&e))
    }
}

impl<S, T> OptionalFromRequest<S> for Body<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Option<Self>, ApiError> {
        <axum::Json<T> as OptionalFromRequest<S>>::from_request(req, state)
            .await
            .map(|o| o.map(|axum::Json(v)| Self(v)))
            .map_err(|e| reject(&e))
    }
}
