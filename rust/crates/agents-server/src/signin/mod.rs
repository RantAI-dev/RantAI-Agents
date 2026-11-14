//! What the sign-in routes share: the deployment's public URL, the cookies Auth.js would set,
//! randomness, the caller's address, the throttle and the SSO client.

pub mod cookies;
pub mod throttle;

use axum::http::HeaderMap;

use agents_auth::credential::CredentialKey;
use agents_auth::jwe;

use crate::sso::client::OidcClient;
use crate::sso::env::EnvProvider;

/// The sign-in part of the application state.
#[derive(Debug, Default)]
pub struct SignIn {
    /// `AUTH_URL`, else `NEXTAUTH_URL`: the origin the browser sees, without a trailing slash.
    /// Without it the origin is read from the request (`Host`, `X-Forwarded-Proto`), as Auth.js
    /// does with `trustHost`.
    pub public_url: Option<String>,
    /// `CREDENTIAL_ENCRYPTION_KEY`: encrypts provider client secrets. Without it a provider
    /// cannot store a secret.
    pub credential_key: Option<CredentialKey>,
    /// The provider from `AUTH_OIDC_*`, for an install with one IdP and no admin step.
    pub env_provider: Option<EnvProvider>,
    pub throttle: throttle::Throttle,
    pub oidc: OidcClient,
}

/// Fresh random bytes from the operating system.
pub fn random<const N: usize>() -> Result<[u8; N], getrandom::Error> {
    let mut bytes = [0u8; N];
    getrandom::getrandom(&mut bytes)?;
    Ok(bytes)
}

/// A fresh JWE initialisation vector.
pub fn random_iv() -> Result<[u8; jwe::IV_LEN], getrandom::Error> {
    random::<{ jwe::IV_LEN }>()
}

impl SignIn {
    /// The origin the browser sees: the configured URL, else the request's own.
    #[must_use]
    pub fn origin(&self, headers: &HeaderMap) -> String {
        if let Some(url) = &self.public_url {
            return url.clone();
        }
        let header = |name: &str| {
            headers
                .get(name)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.split(',').next())
                .map(str::trim)
                .filter(|v| !v.is_empty())
        };
        let host = header("x-forwarded-host")
            .or_else(|| header("host"))
            .unwrap_or("localhost");
        let proto = header("x-forwarded-proto").unwrap_or("http");
        format!("{proto}://{host}")
    }

    /// Whether cookies get `Secure` and the `__Secure-` prefix: the site is served over HTTPS
    /// (`useSecureCookies ?? url.protocol === "https:"` in `@auth/core/lib/init.js`).
    #[must_use]
    pub fn secure_cookies(&self, headers: &HeaderMap) -> bool {
        self.origin(headers).starts_with("https://")
    }

    /// A state-changing sign-in request from a page of another site is refused. A request with no
    /// `Origin` (a mobile app, curl) passes; a browser always sends one on a cross-site POST.
    #[must_use]
    pub fn same_origin(&self, headers: &HeaderMap) -> bool {
        headers
            .get(axum::http::header::ORIGIN)
            .and_then(|v| v.to_str().ok())
            .is_none_or(|origin| origin == self.origin(headers))
    }
}

/// The caller's address as the nearest proxy saw it: the last `X-Forwarded-For` entry, which the
/// proxy in front of this service appended (Next.js or the load balancer), then `X-Real-IP`. The
/// first entry is whatever the client wrote, so it is never used.
#[must_use]
pub fn client_address(headers: &HeaderMap) -> String {
    let forwarded = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit(',').next())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    forwarded
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(str::trim)
        })
        .filter(|v| !v.is_empty())
        .unwrap_or("unknown")
        .to_owned()
}

/// A path on this site to send the browser to after sign-in: `/` plus anything but a second `/`
/// or `\` (which a browser reads as another host). Anything else falls back to `/dashboard`.
#[must_use]
pub fn safe_return_to(requested: Option<&str>) -> String {
    match requested {
        Some(path)
            if path.starts_with('/')
                && !path.starts_with("//")
                && !path.starts_with("/\\")
                && !path.chars().any(char::is_control) =>
        {
            path.to_owned()
        }
        _ => "/dashboard".to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_local_path_is_a_return_target() {
        assert_eq!(
            safe_return_to(Some("/dashboard/chat?x=1")),
            "/dashboard/chat?x=1"
        );
        for bad in [
            "//evil.test",
            "/\\evil.test",
            "https://evil.test",
            "dash",
            "/a\nb",
        ] {
            assert_eq!(safe_return_to(Some(bad)), "/dashboard", "{bad}");
        }
        assert_eq!(safe_return_to(None), "/dashboard");
    }

    #[test]
    fn the_address_is_the_proxys_entry_not_the_clients() {
        let mut h = HeaderMap::new();
        h.insert(
            "x-forwarded-for",
            "6.6.6.6, 10.0.0.7"
                .parse()
                .unwrap_or(axum::http::HeaderValue::from_static("")),
        );
        assert_eq!(client_address(&h), "10.0.0.7");
        assert_eq!(client_address(&HeaderMap::new()), "unknown");
    }
}
