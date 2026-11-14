//! The request bodies of the organisation routes, and what is wrong with them.
//!
//! The bodies are read by hand (`serde_json::Value` in, typed values out) because a deserializer
//! stops at the first field it cannot read, and the caller must get every bad field at once.
//! The shape follows the old zod schemas (`src/features/organizations/*/schema.ts`), with the
//! fields the design adds: the unit tree, the lead flag and the password sign-in switch.

use serde_json::{Map, Value};

use agents_core::validation::FieldError;

use crate::http::ApiError;

/// The longest organisation or unit name.
const MAX_NAME_LEN: usize = 100;
/// The longest slug.
const MAX_SLUG_LEN: usize = 63;
/// The longest e-mail address the column takes.
const MAX_EMAIL_LEN: usize = 320;
/// The longest id (a member, unit or user id) the API accepts.
const MAX_ID_LEN: usize = 200;
/// The longest external id (the identity-provider group).
const MAX_EXTERNAL_ID_LEN: usize = 200;

/// What a settings change asks for. `None` keeps the column.
#[derive(Debug, Clone, Default)]
pub(super) struct OrgUpdate {
    pub name: Option<String>,
    pub slug: Option<String>,
    pub password_login_enabled: Option<bool>,
}

/// A new unit.
#[derive(Debug, Clone)]
pub(super) struct UnitCreate {
    pub parent_id: Option<String>,
    pub kind: String,
    pub name: String,
    pub slug: String,
}

/// A change to a unit: a rename, a move, or both.
#[derive(Debug, Clone, Default)]
pub(super) struct UnitUpdate {
    /// `None` keeps the name; `Some` renames.
    pub name: Option<String>,
    /// `None` keeps the external id; `Some(None)` clears it.
    pub external_id: Option<Option<String>>,
    /// `None` leaves the unit where it is; `Some(None)` moves it to the top level.
    pub parent_id: Option<Option<String>>,
}

fn field(pointer: impl Into<String>, code: &'static str, message: &str) -> FieldError {
    FieldError::new(pointer, code, message)
}

fn not_an_object() -> ApiError {
    ApiError::from(vec![field(
        "",
        "invalid_shape",
        "The body must be a JSON object.",
    )])
}

fn reject_unknown(object: &Map<String, Value>, allowed: &[&str], errors: &mut Vec<FieldError>) {
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            errors.push(field(
                format!("/{key}"),
                "unknown_field",
                "This field is not part of the request.",
            ));
        }
    }
}

fn as_object(body: &Value) -> Result<&Map<String, Value>, ApiError> {
    body.as_object().ok_or_else(not_an_object)
}

/// A string field. An absent required field, a wrong type and a value that is too long are each
/// an error; every bad field is listed.
fn read_string(
    object: &Map<String, Value>,
    key: &str,
    required: bool,
    max_len: usize,
    errors: &mut Vec<FieldError>,
) -> Option<String> {
    let pointer = format!("/{key}");
    match object.get(key) {
        None => {
            if required {
                errors.push(field(pointer, "required", "This field is required."));
            }
            None
        }
        Some(Value::String(text)) => {
            if text.chars().count() > max_len {
                errors.push(field(
                    pointer,
                    "too_long",
                    &format!("This field must be at most {max_len} characters."),
                ));
                None
            } else {
                Some(text.clone())
            }
        }
        Some(_) => {
            errors.push(field(
                pointer,
                "invalid_type",
                "This field must be a string.",
            ));
            None
        }
    }
}

/// A `parentId` or `externalId` field: absent, `null` or a string.
fn read_optional_id(
    object: &Map<String, Value>,
    key: &str,
    max_len: usize,
    errors: &mut Vec<FieldError>,
) -> Option<Option<String>> {
    match object.get(key) {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(text)) => {
            if text.is_empty() {
                errors.push(field(
                    format!("/{key}"),
                    "required",
                    "This field must not be empty.",
                ));
                None
            } else if text.chars().count() > max_len {
                errors.push(field(
                    format!("/{key}"),
                    "too_long",
                    &format!("This field must be at most {max_len} characters."),
                ));
                None
            } else {
                Some(Some(text.clone()))
            }
        }
        Some(_) => {
            errors.push(field(
                format!("/{key}"),
                "invalid_type",
                "This field must be a string or null.",
            ));
            None
        }
    }
}

fn read_bool(object: &Map<String, Value>, key: &str, errors: &mut Vec<FieldError>) -> Option<bool> {
    match object.get(key) {
        None => None,
        Some(Value::Bool(value)) => Some(*value),
        Some(_) => {
            errors.push(field(
                format!("/{key}"),
                "invalid_type",
                "This field must be a boolean.",
            ));
            None
        }
    }
}

/// A name that is not blank, trimmed as the old service trimmed it.
fn read_name(
    object: &Map<String, Value>,
    key: &str,
    required: bool,
    errors: &mut Vec<FieldError>,
) -> Option<String> {
    let name = read_string(object, key, required, MAX_NAME_LEN, errors)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        errors.push(field(
            format!("/{key}"),
            "required",
            "This field must not be empty.",
        ));
        return None;
    }
    Some(trimmed.to_owned())
}

/// A slug: lower-case letters, digits and `-`, not starting or ending with `-`.
fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= MAX_SLUG_LEN
        && !slug.starts_with('-')
        && !slug.ends_with('-')
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// The slug a name makes when the caller sends none: lower-case, one `-` between words.
pub(super) fn slugify(name: &str) -> String {
    let mut slug = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let trimmed = slug.trim_matches('-');
    let capped: String = trimmed.chars().take(MAX_SLUG_LEN).collect();
    let capped = capped.trim_end_matches('-');
    if capped.is_empty() {
        "unit".to_owned()
    } else {
        capped.to_owned()
    }
}

/// The body of a `PATCH /api/organizations/{id}`.
pub(super) fn parse_org_update(body: &Value) -> Result<OrgUpdate, ApiError> {
    let object = as_object(body)?;
    let mut errors = Vec::new();
    reject_unknown(
        object,
        &["name", "slug", "passwordLoginEnabled"],
        &mut errors,
    );
    let name = read_name(object, "name", false, &mut errors);
    let slug = read_string(object, "slug", false, MAX_SLUG_LEN, &mut errors).and_then(|slug| {
        if valid_slug(&slug) {
            Some(slug)
        } else {
            errors.push(field(
                "/slug",
                "invalid_format",
                "This field must use lower-case letters, digits and hyphens.",
            ));
            None
        }
    });
    let password_login_enabled = read_bool(object, "passwordLoginEnabled", &mut errors);
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    if name.is_none() && slug.is_none() && password_login_enabled.is_none() {
        return Err(ApiError::from(vec![field(
            "",
            "required",
            "Send at least one of name, slug or passwordLoginEnabled.",
        )]));
    }
    Ok(OrgUpdate {
        name,
        slug,
        password_login_enabled,
    })
}

/// The body of an invite: an address and a role.
pub(super) fn parse_invite(body: &Value) -> Result<(String, String), ApiError> {
    let object = as_object(body)?;
    let mut errors = Vec::new();
    reject_unknown(object, &["email", "role"], &mut errors);
    let email = read_string(object, "email", true, MAX_EMAIL_LEN, &mut errors).and_then(|email| {
        let trimmed = email.trim().to_lowercase();
        if valid_email(&trimmed) {
            Some(trimmed)
        } else {
            errors.push(field(
                "/email",
                "invalid_format",
                "This field must be an e-mail address.",
            ));
            None
        }
    });
    // An invite cannot create an owner: owners are made by changing a member's role, which only
    // an owner may do.
    let role = read_role(
        object,
        &["admin", "member", "viewer"],
        "member",
        &mut errors,
    );
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok((email.unwrap_or_default(), role))
}

/// The body of a role change.
pub(super) fn parse_role(body: &Value) -> Result<String, ApiError> {
    let object = as_object(body)?;
    let mut errors = Vec::new();
    reject_unknown(object, &["role"], &mut errors);
    let role = read_role(
        object,
        &["owner", "admin", "member", "viewer"],
        "",
        &mut errors,
    );
    if !errors.is_empty() || role.is_empty() {
        if errors.is_empty() {
            errors.push(field("/role", "required", "This field is required."));
        }
        return Err(ApiError::from(errors));
    }
    Ok(role)
}

fn read_role(
    object: &Map<String, Value>,
    allowed: &[&str],
    default: &str,
    errors: &mut Vec<FieldError>,
) -> String {
    match object.get("role") {
        None if !default.is_empty() => default.to_owned(),
        None => String::new(),
        Some(Value::String(role)) if allowed.contains(&role.as_str()) => role.clone(),
        Some(Value::String(_)) => {
            errors.push(field(
                "/role",
                "invalid_enum",
                &format!("The role must be one of {}.", allowed.join(", ")),
            ));
            String::new()
        }
        Some(_) => {
            errors.push(field(
                "/role",
                "invalid_type",
                "This field must be a string.",
            ));
            String::new()
        }
    }
}

fn valid_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.is_empty()
        && domain.contains('.')
        && !email.chars().any(char::is_whitespace)
}

/// The body of a unit create.
pub(super) fn parse_unit_create(body: &Value) -> Result<UnitCreate, ApiError> {
    let object = as_object(body)?;
    let mut errors = Vec::new();
    reject_unknown(object, &["parentId", "kind", "name", "slug"], &mut errors);
    let parent_id = read_optional_id(object, "parentId", MAX_ID_LEN, &mut errors).flatten();
    let kind = match object.get("kind") {
        Some(Value::String(kind)) if kind == "department" || kind == "team" => kind.clone(),
        Some(Value::String(_)) => {
            errors.push(field(
                "/kind",
                "invalid_enum",
                "The kind must be department or team.",
            ));
            String::new()
        }
        Some(_) => {
            errors.push(field(
                "/kind",
                "invalid_type",
                "This field must be a string.",
            ));
            String::new()
        }
        None => {
            errors.push(field("/kind", "required", "This field is required."));
            String::new()
        }
    };
    let name = read_name(object, "name", true, &mut errors).unwrap_or_default();
    let slug = match read_string(object, "slug", false, MAX_SLUG_LEN, &mut errors) {
        Some(slug) if valid_slug(&slug) => slug,
        Some(_) => {
            errors.push(field(
                "/slug",
                "invalid_format",
                "This field must use lower-case letters, digits and hyphens.",
            ));
            String::new()
        }
        None => slugify(&name),
    };
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(UnitCreate {
        parent_id,
        kind,
        name,
        slug,
    })
}

/// The body of a unit update: a rename, a move, or both.
pub(super) fn parse_unit_update(body: &Value) -> Result<UnitUpdate, ApiError> {
    let object = as_object(body)?;
    let mut errors = Vec::new();
    reject_unknown(object, &["name", "externalId", "parentId"], &mut errors);
    let name = read_name(object, "name", false, &mut errors);
    let external_id = read_optional_id(object, "externalId", MAX_EXTERNAL_ID_LEN, &mut errors);
    let parent_id = read_optional_id(object, "parentId", MAX_ID_LEN, &mut errors);
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    if name.is_none() && external_id.is_none() && parent_id.is_none() {
        return Err(ApiError::from(vec![field(
            "",
            "required",
            "Send at least one of name, externalId or parentId.",
        )]));
    }
    Ok(UnitUpdate {
        name,
        external_id,
        parent_id,
    })
}

/// The body that adds a user to a unit: the user, and whether they lead it.
pub(super) fn parse_unit_member(body: &Value) -> Result<(String, bool), ApiError> {
    let object = as_object(body)?;
    let mut errors = Vec::new();
    reject_unknown(object, &["userId", "isLead"], &mut errors);
    let user_id = read_string(object, "userId", true, MAX_ID_LEN, &mut errors)
        .filter(|id| !id.is_empty())
        .unwrap_or_default();
    if user_id.is_empty() && !errors.iter().any(|e| e.field == "/userId") {
        errors.push(field(
            "/userId",
            "required",
            "This field must not be empty.",
        ));
    }
    let is_lead = read_bool(object, "isLead", &mut errors).unwrap_or(false);
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok((user_id, is_lead))
}

/// The body that removes or targets one user: `{ "userId": "…" }`.
pub(super) fn parse_user_id(body: &Value) -> Result<String, ApiError> {
    let object = as_object(body)?;
    let mut errors = Vec::new();
    reject_unknown(object, &["userId"], &mut errors);
    let user_id = read_string(object, "userId", true, MAX_ID_LEN, &mut errors).unwrap_or_default();
    if user_id.is_empty() && !errors.iter().any(|e| e.field == "/userId") {
        errors.push(field(
            "/userId",
            "required",
            "This field must not be empty.",
        ));
    }
    if !errors.is_empty() {
        return Err(ApiError::from(errors));
    }
    Ok(user_id)
}
