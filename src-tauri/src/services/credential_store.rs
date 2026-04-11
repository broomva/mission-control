use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tracing::{info, warn};

/// Simple encrypted credential storage backed by a JSON file.
///
/// Credentials are XOR-obfuscated with a machine-derived key to prevent
/// casual reading.  This is NOT cryptographic security — the goal is to
/// ensure API keys never appear in plain text on disk.
pub struct CredentialStore {
    path: PathBuf,
    /// In-memory cache protected by a mutex so it is Send + Sync.
    cache: Mutex<HashMap<String, String>>,
    key: Vec<u8>,
}

impl CredentialStore {
    /// Create (or open) a credential store at the given path.
    ///
    /// The obfuscation key is derived from hostname + username so it is
    /// stable across restarts on the same machine.
    pub fn new(path: PathBuf) -> Self {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        let key = derive_machine_key();
        let cache = Self::load_from_disk(&path, &key);
        info!(path = %path.display(), services = cache.len(), "credential store initialized");
        Self {
            path,
            cache: Mutex::new(cache),
            key,
        }
    }

    /// Store (or overwrite) a credential for a service.
    pub fn add(&self, service: &str, secret: &str) {
        {
            let mut map = self.cache.lock().unwrap();
            map.insert(service.to_string(), secret.to_string());
        }
        self.flush();
        info!(service, "credential stored");
    }

    /// Retrieve the plaintext credential for a service.
    pub fn get(&self, service: &str) -> Option<String> {
        let map = self.cache.lock().unwrap();
        map.get(service).cloned()
    }

    /// Remove a credential.
    pub fn remove(&self, service: &str) {
        {
            let mut map = self.cache.lock().unwrap();
            map.remove(service);
        }
        self.flush();
        info!(service, "credential removed");
    }

    /// List configured service names (never exposes the keys themselves).
    pub fn list_services(&self) -> Vec<String> {
        let map = self.cache.lock().unwrap();
        let mut names: Vec<String> = map.keys().cloned().collect();
        names.sort();
        names
    }

    // ── internal ───────────────────────────────────────────────────

    fn flush(&self) {
        let map = self.cache.lock().unwrap();
        let json = match serde_json::to_string(&*map) {
            Ok(j) => j,
            Err(e) => {
                warn!(error = %e, "failed to serialize credentials");
                return;
            }
        };
        let obfuscated = xor_bytes(json.as_bytes(), &self.key);
        if let Err(e) = fs::write(&self.path, &obfuscated) {
            warn!(error = %e, "failed to write credential store");
        }
    }

    fn load_from_disk(path: &PathBuf, key: &[u8]) -> HashMap<String, String> {
        let data = match fs::read(path) {
            Ok(d) => d,
            Err(_) => return HashMap::new(),
        };
        let plain = xor_bytes(&data, key);
        match serde_json::from_slice::<HashMap<String, String>>(&plain) {
            Ok(map) => map,
            Err(e) => {
                warn!(error = %e, "credential store corrupted or key changed, starting fresh");
                HashMap::new()
            }
        }
    }
}

/// XOR a byte slice with a repeating key.
fn xor_bytes(data: &[u8], key: &[u8]) -> Vec<u8> {
    if key.is_empty() {
        return data.to_vec();
    }
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect()
}

/// Derive a stable obfuscation key from the current machine identity.
fn derive_machine_key() -> Vec<u8> {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown-host".to_string());
    let username = whoami::username();
    let seed = format!("mission-control:{}:{}", hostname, username);

    // Simple hash-like expansion — NOT cryptographically secure, just
    // good enough to prevent plain-text credential leakage on disk.
    let mut key = Vec::with_capacity(32);
    let mut h: u64 = 0xcbf2_9ce4_8422_2325; // FNV offset basis
    for b in seed.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3); // FNV prime
        key.push((h & 0xff) as u8);
        if key.len() >= 32 {
            break;
        }
    }
    // Pad if seed was very short
    while key.len() < 32 {
        h = h.wrapping_mul(0x0100_0000_01b3);
        key.push((h & 0xff) as u8);
    }
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_xor() {
        let key = b"testkey";
        let plaintext = b"hello world secret";
        let cipher = xor_bytes(plaintext, key);
        assert_ne!(&cipher, plaintext);
        let back = xor_bytes(&cipher, key);
        assert_eq!(back, plaintext);
    }

    #[test]
    fn empty_key_is_noop() {
        let data = b"unchanged";
        let result = xor_bytes(data, b"");
        assert_eq!(result, data);
    }

    #[test]
    fn derive_key_is_stable() {
        let k1 = derive_machine_key();
        let k2 = derive_machine_key();
        assert_eq!(k1, k2);
        assert_eq!(k1.len(), 32);
    }

    #[test]
    fn store_add_get_remove_list() {
        let dir = tempfile::tempdir().unwrap();
        let store = CredentialStore::new(dir.path().join("creds.bin"));

        assert!(store.list_services().is_empty());
        assert!(store.get("anthropic").is_none());

        store.add("anthropic", "sk-ant-secret");
        store.add("openai", "sk-openai-secret");

        assert_eq!(store.get("anthropic").unwrap(), "sk-ant-secret");
        assert_eq!(store.get("openai").unwrap(), "sk-openai-secret");
        assert_eq!(store.list_services(), vec!["anthropic", "openai"]);

        store.remove("anthropic");
        assert!(store.get("anthropic").is_none());
        assert_eq!(store.list_services(), vec!["openai"]);
    }

    #[test]
    fn persistence_across_instances() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.bin");

        {
            let store = CredentialStore::new(path.clone());
            store.add("github", "ghp_test123");
        }

        // Reopen
        let store2 = CredentialStore::new(path);
        assert_eq!(store2.get("github").unwrap(), "ghp_test123");
    }

    #[test]
    fn corrupted_file_starts_fresh() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.bin");
        fs::write(&path, b"not valid data").unwrap();

        let store = CredentialStore::new(path);
        assert!(store.list_services().is_empty());
    }
}
