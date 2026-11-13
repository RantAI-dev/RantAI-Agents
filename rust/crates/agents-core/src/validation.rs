//! The one validation error shape. The HTTP layer maps a `Vec<FieldError>` to a 400
//! `invalid_request` body with every bad field, not only the first.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FieldError {
    /// A JSON Pointer into the request body, for example `/modelConfig/temperature`.
    pub field: String,
    /// A stable lower_snake_case code a client can branch on, for example `out_of_range`.
    pub code: &'static str,
    pub message: String,
}

impl FieldError {
    #[must_use]
    pub fn new(field: impl Into<String>, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            field: field.into(),
            code,
            message: message.into(),
        }
    }
}
