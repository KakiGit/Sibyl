use crate::{Request, Response, Result};
use std::io::{Read, Write};
use std::path::PathBuf;
use tokio::net::UnixStream;
use tracing::{debug, info, warn};

#[derive(Clone)]
pub struct IpcClient {
    socket_path: PathBuf,
}

impl IpcClient {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
        }
    }

    pub async fn send(&self, request: Request) -> Result<Response> {
        info!("IPC: Connecting to {}", self.socket_path.display());

        let mut stream = UnixStream::connect(&self.socket_path).await.map_err(|e| {
            warn!(
                "IPC: Connection failed to {}: {}",
                self.socket_path.display(),
                e
            );
            crate::Error::ConnectionError(e.to_string())
        })?;

        debug!("IPC: Connected, sending request");

        let request_bytes = serde_json::to_vec(&request)?;
        let len = request_bytes.len() as u32;

        let mut buf = len.to_be_bytes().to_vec();
        buf.extend(request_bytes);

        tokio::io::AsyncWriteExt::write_all(&mut stream, &buf)
            .await
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;

        debug!("IPC: Request sent, waiting for response");

        let mut len_buf = [0u8; 4];
        tokio::io::AsyncReadExt::read_exact(&mut stream, &mut len_buf)
            .await
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;

        let len = u32::from_be_bytes(len_buf) as usize;
        let mut response_buf = vec![0u8; len];
        tokio::io::AsyncReadExt::read_exact(&mut stream, &mut response_buf)
            .await
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;

        let response: Response = serde_json::from_slice(&response_buf)?;
        debug!("IPC: Received response");
        Ok(response)
    }

    pub fn send_blocking(&self, request: Request) -> Result<Response> {
        info!(
            "IPC: Connecting (blocking) to {}",
            self.socket_path.display()
        );

        let mut stream =
            std::os::unix::net::UnixStream::connect(&self.socket_path).map_err(|e| {
                warn!(
                    "IPC: Connection failed to {}: {}",
                    self.socket_path.display(),
                    e
                );
                crate::Error::ConnectionError(e.to_string())
            })?;

        debug!("IPC: Connected (blocking), sending request");

        let request_bytes = serde_json::to_vec(&request)?;
        let len = request_bytes.len() as u32;

        let mut buf = len.to_be_bytes().to_vec();
        buf.extend(request_bytes);

        stream
            .write_all(&buf)
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;

        debug!("IPC: Request sent (blocking), waiting for response");

        let mut len_buf = [0u8; 4];
        stream
            .read_exact(&mut len_buf)
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;

        let len = u32::from_be_bytes(len_buf) as usize;
        let mut response_buf = vec![0u8; len];
        stream
            .read_exact(&mut response_buf)
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;

        let response: Response = serde_json::from_slice(&response_buf)?;
        debug!("IPC: Received response (blocking)");
        Ok(response)
    }
}
