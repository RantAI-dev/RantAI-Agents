//! The JWE Auth.js writes for a session cookie: `alg` "dir" with `enc` "A256CBC-HS512", and a
//! content encryption key derived from the secret with HKDF-SHA256, salted with the cookie name.
//!
//! Reference: `@auth/core/jwt` (`encode`, `decode`, `getDerivedEncryptionKey`) and `jose`
//! (`cbcDecrypt`, `calculateJwkThumbprint`).

use aes::Aes256;
use aes::cipher::block_padding::Pkcs7;
use aes::cipher::{BlockDecryptMut, KeyIvInit};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256, Sha512};
use subtle::ConstantTimeEq;

use crate::AuthError;
use crate::base64url;

type HmacSha512 = Hmac<Sha512>;

/// The key management algorithm Auth.js uses: the derived key *is* the content encryption key.
pub const ALG_DIR: &str = "dir";
/// The content encryption algorithm Auth.js uses.
pub const ENC_A256CBC_HS512: &str = "A256CBC-HS512";
/// 64 bytes: the first 32 are the HMAC-SHA-512 key, the last 32 the AES-256-CBC key.
pub const CEK_LEN: usize = 64;
/// The AES-256 key and the MAC key are the same length.
const HALF_CEK: usize = CEK_LEN / 2;
/// AES-CBC uses a 16 byte initialisation vector.
const IV_LEN: usize = 16;
/// The authentication tag is the first half of the HMAC-SHA-512 output.
const TAG_LEN: usize = 32;

/// The protected header of a compact JWE, as far as it matters here.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProtectedHeader {
    /// The key management algorithm.
    pub alg: String,
    /// The content encryption algorithm.
    pub enc: String,
    /// The RFC 7638 thumbprint of the key the token was issued with, when there is one.
    pub kid: Option<String>,
}

#[derive(serde::Deserialize)]
struct RawHeader {
    alg: String,
    enc: String,
    #[serde(default)]
    kid: Option<String>,
}

/// The five parts of a compact JWE.
fn jwe_parts(token: &str) -> Result<[&str; 5], AuthError> {
    let parts: Vec<&str> = token.split('.').collect();
    parts.try_into().map_err(|_| AuthError::Invalid)
}

/// The protected header of a compact JWE.
pub fn protected_header(token: &str) -> Result<ProtectedHeader, AuthError> {
    let [protected, ..] = jwe_parts(token)?;
    let raw: RawHeader =
        serde_json::from_slice(&base64url::decode(protected)?).map_err(|_| AuthError::Invalid)?;
    Ok(ProtectedHeader {
        alg: raw.alg,
        enc: raw.enc,
        kid: raw.kid,
    })
}

/// The key Auth.js derives from the secret: HKDF-SHA256, the cookie name as the salt, and
/// `Auth.js Generated Encryption Key (<salt>)` as the info.
pub fn derive_cek(secret: &str, salt: &str) -> Result<[u8; CEK_LEN], AuthError> {
    let info = format!("Auth.js Generated Encryption Key ({salt})");
    let hk = Hkdf::<Sha256>::new(Some(salt.as_bytes()), secret.as_bytes());
    let mut cek = [0u8; CEK_LEN];
    hk.expand(info.as_bytes(), &mut cek)
        .map_err(|_| AuthError::Invalid)?;
    Ok(cek)
}

/// The thumbprint Auth.js puts in `kid`: the RFC 7638 thumbprint of the symmetric key, which
/// is the SHA-512 of the JWK with its required members only.
#[must_use]
pub fn thumbprint(cek: &[u8; CEK_LEN]) -> String {
    let jwk = format!("{{\"k\":\"{}\",\"kty\":\"oct\"}}", base64url::encode(cek));
    base64url::encode(&Sha512::digest(jwk.as_bytes()))
}

/// Decrypt a compact JWE with the content encryption key.
pub fn decrypt(token: &str, cek: &[u8; CEK_LEN]) -> Result<Vec<u8>, AuthError> {
    let [protected, encrypted_key, iv_text, ciphertext_text, tag_text] = jwe_parts(token)?;
    // "dir" has no encrypted key: the derived key is used directly.
    if !encrypted_key.is_empty() {
        return Err(AuthError::Invalid);
    }
    let iv = base64url::decode(iv_text)?;
    let ciphertext = base64url::decode(ciphertext_text)?;
    let tag = base64url::decode(tag_text)?;
    if iv.len() != IV_LEN || tag.len() != TAG_LEN {
        return Err(AuthError::Invalid);
    }
    if ciphertext.is_empty() || ciphertext.len() % IV_LEN != 0 {
        return Err(AuthError::Invalid);
    }

    // The MAC covers the protected header, the IV, the ciphertext and the header length in bits.
    let mac_data = mac_data(protected.as_bytes(), &iv, &ciphertext);
    let mac_key = cek.get(..HALF_CEK).ok_or(AuthError::Invalid)?;
    let mut mac = <HmacSha512 as Mac>::new_from_slice(mac_key).map_err(|_| AuthError::Invalid)?;
    mac.update(&mac_data);
    let expected = mac.finalize().into_bytes();
    let expected_tag = expected.get(..TAG_LEN).ok_or(AuthError::Invalid)?;
    if expected_tag.ct_eq(&tag).unwrap_u8() != 1 {
        return Err(AuthError::Invalid);
    }

    let mut buffer = ciphertext;
    let enc_key = cek.get(HALF_CEK..).ok_or(AuthError::Invalid)?;
    let decryptor =
        cbc::Decryptor::<Aes256>::new_from_slices(enc_key, &iv).map_err(|_| AuthError::Invalid)?;
    let plaintext = decryptor
        .decrypt_padded_mut::<Pkcs7>(&mut buffer)
        .map_err(|_| AuthError::Invalid)?;
    Ok(plaintext.to_vec())
}

/// `additionalData || iv || ciphertext || uint64be(aad length in bits)`, per RFC 7518 §5.2.2.1.
fn mac_data(protected: &[u8], iv: &[u8], ciphertext: &[u8]) -> Vec<u8> {
    let mut data = Vec::with_capacity(protected.len() + iv.len() + ciphertext.len() + 8);
    data.extend_from_slice(protected);
    data.extend_from_slice(iv);
    data.extend_from_slice(ciphertext);
    data.extend_from_slice(
        &(u64::try_from(protected.len())
            .unwrap_or(u64::MAX)
            .saturating_mul(8))
        .to_be_bytes(),
    );
    data
}
