use crate::error::{DependencyError, Result};
use std::time::Duration;
use tokio::net::{TcpStream, UnixStream};
use tracing::{debug, warn};

pub struct HealthChecker {
    client: reqwest::Client,
}

impl HealthChecker {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(1))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { client }
    }

    pub async fn check_http(&self, url: &str, service: &str) -> Result<()> {
        debug!("Checking HTTP health for {} at {}", service, url);
        
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| DependencyError::HttpError {
                url: url.to_string(),
                message: e.to_string(),
            })?;

        if response.status().is_success() {
            debug!("{} health check passed", service);
            Ok(())
        } else {
            warn!("{} health check failed: status {}", service, response.status());
            Err(DependencyError::HealthCheckFailed {
                service: service.to_string(),
                message: format!("HTTP status: {}", response.status()),
            })
        }
    }

    pub async fn check_tcp_port(&self, port: u16, service: &str) -> Result<()> {
        self.check_tcp_port_on_host("127.0.0.1", port, service).await
    }

    pub async fn check_tcp_port_on_host(&self, host: &str, port: u16, service: &str) -> Result<()> {
        let addr = format!("{}:{}", host, port);
        debug!("Checking TCP health for {} at {}", service, addr);
        
        TcpStream::connect(&addr)
            .await
            .map_err(|e| DependencyError::HealthCheckFailed {
                service: service.to_string(),
                message: format!("TCP connect failed to {}: {}", addr, e),
            })?;

        debug!("{} TCP health check passed", service);
        Ok(())
    }

    pub async fn check_unix_socket(&self, path: &str, service: &str) -> Result<()> {
        debug!("Checking socket health for {} at {}", service, path);
        
        UnixStream::connect(path)
            .await
            .map_err(|e| DependencyError::SocketError {
                path: path.to_string(),
                message: e.to_string(),
            })?;

        debug!("{} socket health check passed", service);
        Ok(())
    }

    pub async fn wait_for_http(
        &self,
        url: &str,
        service: &str,
        timeout: Duration,
    ) -> Result<()> {
        self.wait_with_retry(
            || self.check_http(url, service),
            timeout,
            Duration::from_millis(100),
            service,
        )
        .await
    }

    pub async fn wait_for_tcp(
        &self,
        port: u16,
        service: &str,
        timeout: Duration,
    ) -> Result<()> {
        self.wait_for_tcp_on_host("127.0.0.1", port, service, timeout).await
    }

    pub async fn wait_for_tcp_on_host(
        &self,
        host: &str,
        port: u16,
        service: &str,
        timeout: Duration,
    ) -> Result<()> {
        self.wait_with_retry(
            || self.check_tcp_port_on_host(host, port, service),
            timeout,
            Duration::from_millis(100),
            service,
        )
        .await
    }

    pub async fn wait_for_socket(
        &self,
        path: &str,
        service: &str,
        timeout: Duration,
    ) -> Result<()> {
        self.wait_with_retry(
            || self.check_unix_socket(path, service),
            timeout,
            Duration::from_millis(50),
            service,
        )
        .await
    }

    async fn wait_with_retry<F, Fut>(
        &self,
        check_fn: F,
        timeout: Duration,
        interval: Duration,
        service: &str,
    ) -> Result<()> 
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<()>>,
    {
        let start = std::time::Instant::now();
        
        while start.elapsed() < timeout {
            match check_fn().await {
                Ok(_) => return Ok(()),
                Err(_) => {
                    tokio::time::sleep(interval).await;
                }
            }
        }

        Err(DependencyError::Timeout {
            service: service.to_string(),
        })
    }
}

impl Default for HealthChecker {
    fn default() -> Self {
        Self::new()
    }
}