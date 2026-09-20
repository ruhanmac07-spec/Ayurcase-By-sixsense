use rand::RngCore;
use sha2::{Digest, Sha256};

pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn hash_token(raw_token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw_token.as_bytes());
    hex::encode(hasher.finalize())
}
