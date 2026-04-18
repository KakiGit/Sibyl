use crate::types::OpenCodeEvent;
use crate::Error;
use crate::Result;
use eventsource_stream::Eventsource;
use futures::Stream;
use futures::StreamExt;
use reqwest::Client;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;

pub struct SseClient {
    url: String,
    http: Client,
}

impl SseClient {
    pub fn new(url: impl Into<String>) -> Self {
        let http = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .build()
            .unwrap();
        Self {
            url: url.into(),
            http,
        }
    }

    pub fn with_client(url: impl Into<String>, http: Client) -> Self {
        Self {
            url: url.into(),
            http,
        }
    }

    pub async fn connect(&self) -> Result<EventStream> {
        tracing::info!("Connecting to SSE at: {}", self.url);
        let response = self
            .http
            .get(&self.url)
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "keep-alive")
            .send()
            .await
            .map_err(|e| {
                tracing::error!("SSE send error: {:?}", e);
                Error::ConnectionError(e.to_string())
            })?;

        if !response.status().is_success() {
            return Err(Error::ConnectionError(format!(
                "SSE connection failed: {}",
                response.status()
            )));
        }

        tracing::info!("SSE HTTP connection established, starting stream");

        let stream = response
            .bytes_stream()
            .eventsource()
            .filter_map(|result| async move {
                match result {
                    Ok(event) => {
                        tracing::debug!("SSE event: event={}, data={}", event.event, event.data);
                        if event.event == "message" || event.event.is_empty() {
                            let data = event.data.trim();
                            if data.is_empty() {
                                tracing::debug!("SSE data is empty, skipping");
                                return None;
                            }
                            let event_json: serde_json::Value = match serde_json::from_str(data) {
                                Ok(v) => v,
                                Err(e) => {
                                    tracing::error!("JSON parse error: {} - data: {}", e, data);
                                    return None;
                                }
                            };
                            let inner_event = if let Some(payload) = event_json.get("payload") {
                                payload.clone()
                            } else {
                                event_json
                            };
                            match serde_json::from_value::<OpenCodeEvent>(inner_event.clone()) {
                                Ok(parsed) => {
                                    tracing::info!("Parsed SSE event: {:?}", parsed);
                                    Some(Ok(parsed))
                                }
                                Err(e) => {
                                    tracing::error!(
                                        "Event parse error: {} - payload: {} - data: {}",
                                        e,
                                        inner_event,
                                        data
                                    );
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
