use crate::config::SpawnConfig;
use crate::Error;
use crate::Result;
use reqwest::Client;
use std::process::{Child, Command};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

pub struct OpenCodeProcess {
    child: Arc<Mutex<Option<Child>>>,
    port: u16,
    client: Client,
}

impl OpenCodeProcess {
    pub fn new(config: &SpawnConfig) -> Result<Self> {
        let parts: Vec<&str> = config.command.split_whitespace().collect();
        if parts.is_empty() {
            return Err(Error::IoError(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Empty command",
            )));
        }

        let program = parts[0];
        let mut args: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();
        args.push("--port".to_string());
        args.push(config.port.to_string());

        let child = Command::new(program)
            .args(&args)
            .spawn()
            .map_err(Error::IoError)?;

        Ok(Self {
            child: Arc::new(Mutex::new(Some(child))),
            port: config.port,
            client: Client::new(),
        })
    }

    pub async fn wait_for_ready(&self, timeout: Duration) -> Result<()> {
        let url = format!("http://localhost:{}/health", self.port);
        let iterations = timeout.as_millis() / 100;

        for _ in 0..iterations as u32 {
            if self.client.get(&url).send().await.is_ok() {
                return Ok(());
            }
            sleep(Duration::from_millis(100)).await;
        }

        Err(Error::ConnectionError(
            "OpenCode server did not start within timeout".to_string(),
        ))
    }

    pub async fn stop(&self) -> Result<()> {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            child.kill().map_err(Error::IoError)?;
        }
        Ok(())
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

pub async fn spawn_opencode(config: &SpawnConfig) -> Result<OpenCodeProcess> {
    let process = OpenCodeProcess::new(config)?;
    process.wait_for_ready(config.wait_timeout).await?;
    Ok(process)
}
