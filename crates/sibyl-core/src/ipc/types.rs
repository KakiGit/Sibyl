use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcConfig {
    pub socket_path: String,
    pub timeout_ms: u64,
}

impl Default for IpcConfig {
    fn default() -> Self {
        Self {
            socket_path: "/tmp/sibyl.sock".to_string(),
            timeout_ms: 30000,
        }
    }
}
