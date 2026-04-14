use crate::Result;
use futures::{StreamExt, SinkExt};
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

pub struct WebSocketClient {
    url: String,
}

impl WebSocketClient {
    pub fn new(url: impl Into<String>) -> Self {
        Self { url: url.into() }
    }

    pub async fn connect(&self) -> Result<()> {
        let (ws_stream, _) = connect_async(&self.url)
            .await
            .map_err(|e| crate::Error::ConnectionError(e.to_string()))?;
        
        let (mut write, mut read) = ws_stream.split();
        
        while let Some(msg) = read.next().await {
            match msg {
                Ok(WsMessage::Text(text)) => {
                    tracing::debug!("Received: {}", text);
                }
                Ok(WsMessage::Close(_)) => break,
                Err(e) => {
                    tracing::error!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }
        
        Ok(())
    }
}