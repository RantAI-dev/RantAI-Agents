//! The encryption the TypeScript `Credential` feature uses (`src/lib/workflow/credentials.ts`):
//! AES-256-GCM with a 16 byte IV, the key from `CREDENTIAL_ENCRYPTION_KEY`, and the result packed
//! as base64 of `iv (16) || tag (16) || ciphertext`. The same format both ways, so a secret one
//! side stored the other can read.

use aes::Aes256;
use aes_gcm::aead::consts::U16;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{AesGcm, Nonce};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;

/// The TypeScript uses a 16 byte IV, not GCM's usual 12.
type Cipher = AesGcm<Aes256, U16>;

const IV_LEN: usize = 16;
const TAG_LEN: usize = 16;

/// The name of the variable the key is read from, the same as the TypeScript's.
pub const KEY_ENV: &str = "CREDENTIAL_ENCRYPTION_KEY";

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CredentialError {
    /// The key is neither 64 hex characters nor 32 bytes.
    #[error("CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (raw) or 64 hex characters")]
    BadKey,
    /// The stored value is not one this key encrypted.
    #[error("the encrypted value could not be decrypted")]
    Undecryptable,
}

/// The 32 byte key.
#[derive(Clone)]
pub struct CredentialKey([u8; 32]);

impl std::fmt::Debug for CredentialKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CredentialKey(..)")
    }
}

impl CredentialKey {
    /// `getEncryptionKey`: 64 hex characters, or a raw 32 byte string.
    pub fn parse(text: &str) -> Result<Self, CredentialError> {
        let mut key = [0u8; 32];
        if text.len() == 64 && text.bytes().all(|b| b.is_ascii_hexdigit()) {
            for (slot, pair) in key.iter_mut().zip(text.as_bytes().chunks(2)) {
                let hex = std::str::from_utf8(pair).map_err(|_| CredentialError::BadKey)?;
                *slot = u8::from_str_radix(hex, 16).map_err(|_| CredentialError::BadKey)?;
            }
            return Ok(Self(key));
        }
        // `key.length === 32` counts UTF-16 units and the buffer is UTF-8: equal only for ASCII,
        // which is the only raw key the TypeScript can use without its AES call throwing.
        if text.len() == 32 {
            key.copy_from_slice(text.as_bytes());
            return Ok(Self(key));
        }
        Err(CredentialError::BadKey)
    }
}

/// `encryptCredential`: the bytes (the TypeScript passes `JSON.stringify(data)`) under a fresh IV
/// the caller supplies.
#[must_use]
pub fn encrypt(plaintext: &[u8], key: &CredentialKey, iv: &[u8; IV_LEN]) -> String {
    let cipher = Cipher::new(&key.0.into());
    // `encrypt` only fails for a plaintext longer than GCM allows (64 GiB).
    let sealed = cipher
        .encrypt(Nonce::<U16>::from_slice(iv), plaintext)
        .unwrap_or_default();
    let split = sealed.len().saturating_sub(TAG_LEN);
    let (ciphertext, tag) = sealed.split_at(split);
    let mut packed = Vec::with_capacity(IV_LEN + sealed.len());
    packed.extend_from_slice(iv);
    packed.extend_from_slice(tag);
    packed.extend_from_slice(ciphertext);
    STANDARD.encode(packed)
}

/// `decryptCredential`, returning the bytes (the TypeScript then `JSON.parse`s them).
pub fn decrypt(packed_base64: &str, key: &CredentialKey) -> Result<Vec<u8>, CredentialError> {
    let packed = STANDARD
        .decode(packed_base64)
        .map_err(|_| CredentialError::Undecryptable)?;
    if packed.len() < IV_LEN + TAG_LEN + 1 {
        return Err(CredentialError::Undecryptable);
    }
    let (iv, rest) = packed.split_at(IV_LEN);
    let (tag, ciphertext) = rest.split_at(TAG_LEN);
    let mut sealed = Vec::with_capacity(rest.len());
    sealed.extend_from_slice(ciphertext);
    sealed.extend_from_slice(tag);
    Cipher::new(&key.0.into())
        .decrypt(Nonce::<U16>::from_slice(iv), sealed.as_slice())
        .map_err(|_| CredentialError::Undecryptable)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEX_KEY: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    #[test]
    fn a_value_round_trips_and_another_key_cannot_read_it() -> Result<(), CredentialError> {
        let key = CredentialKey::parse(HEX_KEY)?;
        let packed = encrypt(br#"{"clientSecret":"s3cret"}"#, &key, &[9; 16]);
        assert_eq!(decrypt(&packed, &key)?, br#"{"clientSecret":"s3cret"}"#);
        let other = CredentialKey::parse("0123456789abcdef0123456789abcdef")?;
        assert_eq!(
            decrypt(&packed, &other),
            Err(CredentialError::Undecryptable)
        );
        Ok(())
    }

    #[test]
    fn a_value_the_typescript_encrypted_decrypts_and_ours_matches_it() -> Result<(), CredentialError>
    {
        // Node: createCipheriv("aes-256-gcm", HEX_KEY, Buffer.alloc(16, 9)) over
        // JSON.stringify({ clientSecret: "s3cret" }), packed as encryptCredential packs it.
        const FROM_TS: &str =
            "CQkJCQkJCQkJCQkJCQkJCWYgZEJBjVia/gwuFzipV6kwF3ajI6U7b06hpXMyp/hg8C1trcNGgz9X";
        let key = CredentialKey::parse(HEX_KEY)?;
        assert_eq!(decrypt(FROM_TS, &key)?, br#"{"clientSecret":"s3cret"}"#);
        assert_eq!(
            encrypt(br#"{"clientSecret":"s3cret"}"#, &key, &[9; 16]),
            FROM_TS
        );
        Ok(())
    }

    #[test]
    fn a_tampered_value_is_refused() -> Result<(), CredentialError> {
        let key = CredentialKey::parse(HEX_KEY)?;
        let mut bytes = STANDARD
            .decode(encrypt(b"{}", &key, &[1; 16]))
            .map_err(|_| CredentialError::Undecryptable)?;
        if let Some(last) = bytes.last_mut() {
            *last ^= 1;
        }
        assert_eq!(
            decrypt(&STANDARD.encode(bytes), &key),
            Err(CredentialError::Undecryptable)
        );
        Ok(())
    }

    #[test]
    fn a_short_or_odd_key_is_refused() {
        assert!(CredentialKey::parse("short").is_err());
        assert!(CredentialKey::parse(&"g".repeat(64)).is_err());
    }
}
