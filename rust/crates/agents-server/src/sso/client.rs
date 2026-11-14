//! Talking to an OIDC provider: discovery, the JWKS, and the code exchange.
//!
//! Discovery and the JWKS are cached in memory: they are public, read-mostly, and any instance
//! may fetch its own copy. A token whose `kid` is not in the cached JWKS refetches it once (the
//! provider rotated its keys), at most once per cooldown so a stream of bad tokens cannot make
//! us hammer the provider.
//!
//! An organisation admin chooses the provider URLs, so unless private networks are allowed
//! (`SSO_ALLOW_PRIVATE_NETWORKS`), the client refuses any address that is not public: an IP
//! literal is checked before the request, and a name is checked after it is resolved, by the
//! resolver the connector uses, so a name that resolves to a public address for the check and a
//! private one for the connection (DNS rebinding) cannot get through. Redirects are not followed
//! and proxies from the environment are not used, so nothing else picks the address.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use agents_auth::oidc::JwkSet;
use agents_auth::oidc::id_token::{self, Expected, IdTokenClaims, IdTokenError};
use serde::Deserialize;

/// Why a provider call failed. The detail goes to the log, never to the user.
#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("the provider could not be reached or answered badly: {0}")]
    Upstream(String),
    #[error("the ID token was refused: {0}")]
    Token(#[from] IdTokenError),
}

/// The part of the discovery document sign-in uses.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Discovery {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub jwks_uri: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
}

/// How long discovery and the JWKS are kept.
const CACHE_TTL: Duration = Duration::from_secs(10 * 60);
/// The most a provider answer may weigh.
const MAX_BODY_BYTES: usize = 1024 * 1024;

#[derive(Debug)]
struct CachedJwks {
    keys: JwkSet,
    fetched: Instant,
}

/// What an [`OidcClient`] may reach.
#[derive(Debug, Clone, Copy)]
pub struct OidcOptions {
    /// Plain `http://` provider URLs: only a test with a local stub provider sets it.
    pub allow_http: bool,
    /// Loopback, private, link-local, CGNAT, unique-local and metadata addresses. Off for the
    /// providers organisation admins configure, unless the operator sets
    /// `SSO_ALLOW_PRIVATE_NETWORKS=true` (an on-prem install with an internal Keycloak).
    pub allow_private_networks: bool,
    /// The least time between two JWKS fetches for an unknown `kid`.
    pub jwks_refetch_cooldown: Duration,
}

impl Default for OidcOptions {
    fn default() -> Self {
        Self {
            allow_http: false,
            allow_private_networks: false,
            jwks_refetch_cooldown: Duration::from_secs(30),
        }
    }
}

/// Resolves a name only to public addresses: the connector connects to what this returns, so
/// the address checked is the address used.
#[derive(Debug)]
struct PublicOnly;

impl reqwest::dns::Resolve for PublicOnly {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let addrs: Vec<SocketAddr> =
                tokio::net::lookup_host((host.as_str(), 0)).await?.collect();
            if addrs.is_empty() || addrs.iter().any(|a| !agents_core::net::is_public(a.ip())) {
                return Err(format!("{host} resolves to an address that is not public").into());
            }
            let addrs: reqwest::dns::Addrs = Box::new(addrs.into_iter());
            Ok(addrs)
        })
    }
}

#[derive(Debug)]
pub struct OidcClient {
    http: reqwest::Client,
    allow_private_networks: bool,
    discovery: Mutex<HashMap<String, (Instant, Discovery)>>,
    jwks: Mutex<HashMap<String, CachedJwks>>,
    /// Plain `http://` provider URLs are refused unless this is set: only a test with a local
    /// stub provider sets it.
    pub allow_http: bool,
    /// The least time between two JWKS fetches for an unknown `kid`.
    pub jwks_refetch_cooldown: Duration,
}

impl Default for OidcClient {
    /// https only, public addresses only.
    fn default() -> Self {
        Self::new(OidcOptions::default())
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl OidcClient {
    #[must_use]
    pub fn new(options: OidcOptions) -> Self {
        let builder = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none());
        let builder = if options.allow_private_networks {
            builder
        } else {
            // A proxy from the environment would resolve the name itself, past the check.
            builder.no_proxy().dns_resolver(Arc::new(PublicOnly))
        };
        Self {
            http: builder.build().unwrap_or_default(),
            allow_private_networks: options.allow_private_networks,
            discovery: Mutex::new(HashMap::new()),
            jwks: Mutex::new(HashMap::new()),
            allow_http: options.allow_http,
            jwks_refetch_cooldown: options.jwks_refetch_cooldown,
        }
    }

    /// The client of the operator's own provider (`AUTH_OIDC_*`): https only, any address, since
    /// the operator, not an organisation admin, chose it.
    #[must_use]
    pub fn operator() -> Self {
        Self::new(OidcOptions {
            allow_private_networks: true,
            ..OidcOptions::default()
        })
    }

    /// A client that also accepts `http://` providers on any address and refetches keys without
    /// a cooldown: for a test with a local stub provider.
    #[must_use]
    pub fn with_options(allow_http: bool, jwks_refetch_cooldown: Duration) -> Self {
        Self::new(OidcOptions {
            allow_http,
            allow_private_networks: true,
            jwks_refetch_cooldown,
        })
    }

    fn check_url(&self, url: &str) -> Result<(), ClientError> {
        if !(url.starts_with("https://") || (self.allow_http && url.starts_with("http://"))) {
            return Err(ClientError::Upstream(format!("not an https URL: {url}")));
        }
        if self.allow_private_networks {
            return Ok(());
        }
        // The resolver never sees an IP literal: it is checked here.
        let parsed = reqwest::Url::parse(url).map_err(|e| ClientError::Upstream(e.to_string()))?;
        let Some(host) = parsed.host_str() else {
            return Err(ClientError::Upstream(format!("no host in {url}")));
        };
        // `host_str` brackets an IPv6 literal; the URL parser already normalised IPv4 forms
        // such as `0x7f.1` or `2130706433` to dotted decimal.
        let literal = host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<IpAddr>()
            .ok();
        if literal.is_some_and(|ip| !agents_core::net::is_public(ip)) {
            return Err(ClientError::Upstream(format!(
                "not a public address: {url}"
            )));
        }
        Ok(())
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T, ClientError> {
        self.check_url(url)?;
        let res = self
            .http
            .get(url)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|e| ClientError::Upstream(e.to_string()))?;
        read_json(res).await
    }

    /// The discovery document at `url`. Its `issuer` must be `issuer` (OpenID Connect Discovery
    /// §4.3), give or take a trailing slash; the document's spelling is the one tokens must carry.
    pub async fn discover(&self, url: &str, issuer: &str) -> Result<Discovery, ClientError> {
        if let Some((at, doc)) = lock(&self.discovery).get(url)
            && at.elapsed() < CACHE_TTL
        {
            return Ok(doc.clone());
        }
        let doc: Discovery = self.get_json(url).await?;
        if doc.issuer.trim_end_matches('/') != issuer.trim_end_matches('/') {
            return Err(ClientError::Upstream(format!(
                "discovery issuer {} is not the configured {issuer}",
                doc.issuer
            )));
        }
        for endpoint in [
            &doc.authorization_endpoint,
            &doc.token_endpoint,
            &doc.jwks_uri,
        ] {
            self.check_url(endpoint)?;
        }
        lock(&self.discovery).insert(url.to_owned(), (Instant::now(), doc.clone()));
        Ok(doc)
    }

    /// The provider's keys, from the cache unless `refetch`.
    pub async fn jwks(&self, uri: &str, refetch: bool) -> Result<JwkSet, ClientError> {
        if let Some(cached) = lock(&self.jwks).get(uri) {
            let fresh = cached.fetched.elapsed() < CACHE_TTL;
            let cooling = cached.fetched.elapsed() < self.jwks_refetch_cooldown;
            if (fresh && !refetch) || (refetch && cooling) {
                return Ok(cached.keys.clone());
            }
        }
        let keys: JwkSet = self.get_json(uri).await?;
        lock(&self.jwks).insert(
            uri.to_owned(),
            CachedJwks {
                keys: keys.clone(),
                fetched: Instant::now(),
            },
        );
        Ok(keys)
    }

    /// Trades the authorisation code for the ID token (client_secret_post, with the PKCE
    /// verifier).
    pub async fn exchange_code(
        &self,
        doc: &Discovery,
        exchange: &CodeExchange<'_>,
    ) -> Result<String, ClientError> {
        let mut form: Vec<(&str, &str)> = vec![
            ("grant_type", "authorization_code"),
            ("code", exchange.code),
            ("redirect_uri", exchange.redirect_uri),
            ("code_verifier", exchange.verifier),
            ("client_id", exchange.client_id),
        ];
        if let Some(secret) = exchange.client_secret {
            form.push(("client_secret", secret));
        }
        self.check_url(&doc.token_endpoint)?;
        let res = self
            .http
            .post(&doc.token_endpoint)
            .header("accept", "application/json")
            .form(&form)
            .send()
            .await
            .map_err(|e| ClientError::Upstream(e.to_string()))?;
        let body: TokenResponse = read_json(res).await?;
        body.id_token
            .ok_or_else(|| ClientError::Upstream("the token response has no id_token".into()))
    }

    /// Verifies the ID token, refetching the JWKS once when its key is unknown.
    pub async fn verify(
        &self,
        doc: &Discovery,
        token: &str,
        expected: &Expected<'_>,
    ) -> Result<IdTokenClaims, ClientError> {
        let keys = self.jwks(&doc.jwks_uri, false).await?;
        match id_token::verify(token, &keys, expected) {
            Err(IdTokenError::UnknownKey) => {
                let keys = self.jwks(&doc.jwks_uri, true).await?;
                Ok(id_token::verify(token, &keys, expected)?)
            }
            other => Ok(other?),
        }
    }
}

/// What the code exchange sends.
#[derive(Debug, Clone, Copy)]
pub struct CodeExchange<'a> {
    pub code: &'a str,
    pub redirect_uri: &'a str,
    pub verifier: &'a str,
    pub client_id: &'a str,
    pub client_secret: Option<&'a str>,
}

async fn read_json<T: serde::de::DeserializeOwned>(
    res: reqwest::Response,
) -> Result<T, ClientError> {
    let status = res.status();
    if res
        .content_length()
        .is_some_and(|n| n > MAX_BODY_BYTES as u64)
    {
        return Err(ClientError::Upstream("the answer is too large".into()));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| ClientError::Upstream(e.to_string()))?;
    if bytes.len() > MAX_BODY_BYTES {
        return Err(ClientError::Upstream("the answer is too large".into()));
    }
    if !status.is_success() {
        return Err(ClientError::Upstream(format!("status {status}")));
    }
    serde_json::from_slice(&bytes).map_err(|e| ClientError::Upstream(e.to_string()))
}
