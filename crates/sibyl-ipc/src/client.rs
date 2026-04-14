use crate::{Request, Response, Result};
use std::path::PathBuf;
use tokio::net::UnixStream;

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
        let mut stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;
        
        let request_bytes = serde_json::to_vec(&request)?;
        let len = request_bytes.len() as u32;
        
        let mut buf = len.to_be_bytes().to_vec();
        buf.extend(request_bytes);
        
        tokio::io::AsyncWriteExt::write_all(&mut stream, &buf)
            .await
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;
        
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
        Ok(response)
    }
}