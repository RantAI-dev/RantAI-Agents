//! What the sign-in routes share: the deployment's public URL, the cookies Auth.js would set,
//! randomness, the throttle and the SSO clients. The caller's address is `crate::http::client_ip`.

pub mod cookies;
pub mod throttle;

use axum::http::HeaderMap;

use agents_auth::credential::CredentialKey;
use agents_auth::jwe;

use crate::sso::client::OidcClient;
use crate::sso::env::EnvProvider;

/// The sign-in part of the application state.
#[derive(Debug)]
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
    /// The client for the providers organisation admins configure: public addresses only,
    /// unless `SSO_ALLOW_PRIVATE_NETWORKS` is set.
    pub oidc: OidcClient,
    /// The client for the operator's own provider from `AUTH_OIDC_*`: any address.
    pub env_oidc: OidcClient,
}

impl Default for SignIn {
    fn default() -> Self {
        Self {
            public_url: None,
            credential_key: None,
            env_provider: None,
            throttle: throttle::Throttle::default(),
            oidc: OidcClient::default(),
            env_oidc: OidcClient::operator(),
        }
    }
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
    /// The client that may reach this provider: the operator's own one is exempt from the
    /// private-network check, every other one is not.
    #[must_use]
    pub fn oidc_for(&self, provider_id: &str) -> &OidcClient {
        if provider_id == crate::sso::env::ENV_PROVIDER_ID {
            &self.env_oidc
        } else {
            &self.oidc
        }
    }

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
}
