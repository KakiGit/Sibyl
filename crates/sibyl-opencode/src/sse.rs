use crate::types::OpenCodeEvent;
use crate::Result;
use crate::Error;
use futures::Stream;
use futures::StreamExt;
use reqwest::Client;
use std::pin::Pin;
use std::task::{Context, Poll};
use eventsource_stream::Eventsource;

pub struct SseClient {
    url: String,
    http: Client,
}

impl SseClient {
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            http: Client::new(),
        }
    }
    
    pub async fn connect(&self) -> Result<EventStream> {
        tracing::info!("Connecting to SSE at: {}", self.url);
        let response = self.http
            .get(&self.url)
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .send()
            .await
            .map_err(|e| Error::ConnectionError(e.to_string()))?;
        
        if !response.status().is_success() {
            return Err(Error::ConnectionError(format!("SSE connection failed: {}", response.status())));
        }
        
        tracing::info!("SSE HTTP connection established, starting stream");
        
        let stream = response.bytes_stream()
            .eventsource()
            .filter_map(|result| async move {
                match result {
                    Ok(event) => {
                        tracing::debug!("SSE event: event={}, data={}", event.event, event.data);
                        if event.event == "message" || event.event.is_empty() {
                            match serde_json::from_str::<OpenCodeEvent>(&event.data) {
                                Ok(parsed) => Some(Ok(parsed)),
                                Err(e) => {
                                    tracing::warn!("Parse error: {} - data: {}", e, event.data);
                                    None
                                }
                            }
                        } else {
                            tracing::debug!("Ignoring event type: {}", event.event);
                            None
                        }
                    }
                    Err(e) => {
                        tracing::error!("SSE stream error: {:?}", e);
                        None
                    }
                }
            });
        
        Ok(EventStream::new(stream))
    }
}

pub struct EventStream {
    inner: Pin<Box<dyn Stream<Item = Result<OpenCodeEvent>> + Send + Sync>>,
}

impl EventStream {
    pub fn new(stream: impl Stream<Item = Result<OpenCodeEvent>> + Send + Sync + 'static) -> Self {
        Self {
            inner: Box::pin(stream),
        }
    }
}

impl Stream for EventStream {
    type Item = Result<OpenCodeEvent>;
    
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.inner.as_mut().poll_next(cx)
    }
}