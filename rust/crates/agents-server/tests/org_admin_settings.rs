//! Who may change an organisation's settings: the name and slug are the owner's (`org.manage`),
//! the password sign-in switch is sign-in policy (`org.sso.manage`, owners and admins).
//!
//! Set `TEST_DATABASE_URL` to a migrated database; without it each test skips (and fails in CI).

mod common;
mod org_admin_fixtures;

use common::{R, bearer, code, router, send};
use org_admin_fixtures::{member, org};
use serde_json::json;

#[tokio::test]
async fn only_an_owner_renames_the_organisation_and_an_admin_sets_password_login() -> R {
    let Some((app, db)) = router().await? else {
        return Ok(());
    };
    let o = org(&db).await?;
    let owner = common::user(&db, false).await?;
    let admin = common::user(&db, false).await?;
    member(&db, &owner, &o, "owner").await?;
    member(&db, &admin, &o, "admin").await?;
    let uri = format!("/api/organizations/{o}");

    let admin_token = bearer(&admin)?;
    let (status, body) = send(
        &app,
        "PATCH",
        &uri,
        Some(admin_token.as_str()),
        Some(json!({ "name": "Renamed" })),
    )
    .await?;
    assert_eq!(
        (status, code(&body)),
        (403, Some("permission_denied")),
        "{body}"
    );

    let (status, body) = send(
        &app,
        "PATCH",
        &uri,
        Some(admin_token.as_str()),
        Some(json!({ "passwordLoginEnabled": false })),
    )
    .await?;
    assert_eq!(status, 200, "an admin manages sign-in policy: {body}");

    let owner_token = bearer(&owner)?;
    let (status, body) = send(
        &app,
        "PATCH",
        &uri,
        Some(owner_token.as_str()),
        Some(json!({ "name": "Renamed" })),
    )
    .await?;
    assert_eq!(status, 200, "the owner renames: {body}");
    Ok(())
}
