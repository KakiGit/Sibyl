use crate::{Request, Response, Result};
use std::path::PathBuf;
use tokio::net::UnixListener;
use tracing::info;

pub struct IpcServer {
    socket_path: PathBuf,
}

impl IpcServer {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
        }
    }

    pub async fn start(&self) -> Result<()> {
        if self.socket_path.exists() {
            std::fs::remove_file(&self.socket_path)?;
        }
        
        let listener = UnixListener::bind(&self.socket_path)?;
        info!("IPC server listening on {:?}", self.socket_path);
        
        loop {
            let (stream, addr) = listener.accept().await?;
            info!("Accepted connection from {:?}", addr);
            
            tokio::spawn(async move {
                if let Err(e) = Self::handle_connection(stream).await {
                    tracing::error!("Connection error: {}", e);
                }
            });
        }
    }

    async fn handle_connection(mut stream: tokio::net::UnixStream) -> Result<()> {
        loop {
            let mut len_buf = [0u8; 4];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut len_buf)
                .await
                .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;
            
            let len = u32::from_be_bytes(len_buf) as usize;
            let mut request_buf = vec![0u8; len];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut request_buf)
                .await
                .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;
            
            let request: Request = serde_json::from_slice(&request_buf)?;
            let response = Self::handle_request(request).await;
            
            let response_bytes = serde_json::to_vec(&response)?;
            let resp_len = response_bytes.len() as u32;
            
            let mut buf = resp_len.to_be_bytes().to_vec();
            buf.extend(response_bytes);
            
            tokio::io::AsyncWriteExt::write_all(&mut stream, &buf)
                .await
                .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;
        }
    }

    async fn handle_request(request: Request) -> Response {
        match request.method {
            crate::Method::MemoryQuery => {
                Response {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: Some(serde_json::json!({"memories": []})),
                    error: None,
                }
            }
            crate::Method::MemoryAddEpisode => {
                Response {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: Some(serde_json::json!({"status": "ok"})),
                    error: None,
                }
            }
            crate::Method::MemoryGetContext => {
                Response {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: Some(serde_json::json!({"context": ""})),
                    error: None,
                }
            }
            crate::Method::PromptBuild => {
                Response {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: Some(serde_json::json!({"prompt": ""})),
                    error: None,
                }
            }
            crate::Method::RelevanceEvaluate => {
                Response {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: Some(serde_json::json!({"relevance": 0.0})),
                    error: None,
                }
            }
        }
    }
}