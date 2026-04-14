use crate::types::OpenCodeEvent;
use crate::Result;
use crate::Error;
use futures::Stream;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::MaybeTlsStream;
use tokio::net::TcpStream;

pub struct WebSocketClient {
    url: String,
}

impl WebSocketClient {
    pub fn new(url: impl Into<String>) -> Self {
        Self { url: url.into() }
    }
    
    pub async fn connect(&self) -> Result<EventStream> {
        let (ws_stream, _) = connect_async(&self.url)
            .await
            .map_err(|e| Error::ConnectionError(e.to_string()))?;
        
        Ok(EventStream::new(ws_stream))
    }
}

type WsStreamType = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub struct EventStream {
    inner: WsStreamType,
}

impl EventStream {
    pub fn new(stream: WsStreamType) -> Self {
        Self { inner: stream }
    }
}

impl Stream for EventStream {
    type Item = Result<OpenCodeEvent>;
    
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(msg)) => {
                match msg {
                    Ok(WsMessage::Text(text)) => {
                        match serde_json::from_str::<OpenCodeEvent>(&text) {
                            Ok(event) => Poll::Ready(Some(Ok(event))),
                            Err(e) => Poll::Ready(Some(Err(Error::InvalidResponse(format!("JSON parse error: {}", e))))),
                        }
                    }
                    Ok(WsMessage::Close(_)) => Poll::Ready(None),
                    Ok(_) => Poll::Ready(None),
                    Err(e) => Poll::Ready(Some(Err(Error::WebSocketError(e.to_string())))),
                }
            }
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}