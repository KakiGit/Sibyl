use crate::checker::HealthChecker;
use crate::config::FalkorDBDepConfig;
use crate::error::{DependencyError, Result};
use std::process::Stdio;
use tokio::process::Command;
use tracing::{debug, info};

pub struct FalkorDBManager {
    config: FalkorDBDepConfig,
    checker: HealthChecker,
}

impl FalkorDBManager {
    pub fn new(config: FalkorDBDepConfig) -> Self {
        Self {
            config,
            checker: HealthChecker::new(),
        }
    }

    pub async fn ensure_running(&self) -> Result<()> {
        info!("Checking FalkorDB status");
        
        match self.checker.check_tcp_port(self.config.port, "falkordb").await {
            Ok(_) => {
                info!("FalkorDB already running on port {}", self.config.port);
                Ok(())
            }
            Err(_) => {
                debug!("FalkorDB not running, attempting to start");
                self.start_container().await?;
                self.wait_for_healthy().await?;
                info!("FalkorDB started successfully");
                Ok(())
            }
        }
    }

    async fn start_container(&self) -> Result<()> {
        let container_exists = self.container_exists().await?;
        
        if container_exists {
            debug!("Container {} exists, starting it", self.config.container_name);
            self.start_existing_container().await?;
        } else {
            debug!("Container {} does not exist, creating it", self.config.container_name);
            self.create_and_start_container().await?;
        }
        
        Ok(())
    }

    async fn container_exists(&self) -> Result<bool> {
        let output = Command::new("docker")
            .args(["ps", "-a", "--filter", &format!("name={}", self.config.container_name), "--format", "{{.Names}}"])
            .output()
            .await
            .map_err(|e| DependencyError::DockerError {
                message: format!("Failed to check container: {}", e),
            })?;

        let names = String::from_utf8_lossy(&output.stdout);
        Ok(names.lines().any(|line| line == self.config.container_name))
    }

    async fn start_existing_container(&self) -> Result<()> {
        let status = Command::new("docker")
            .args(["container", "start", &self.config.container_name])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status()
            .await
            .map_err(|e| DependencyError::DockerError {
                message: format!("Failed to start container: {}", e),
            })?;

        if !status.success() {
            return Err(DependencyError::DockerError {
                message: format!("docker container start failed for {}", self.config.container_name),
            });
        }

        Ok(())
    }

    async fn create_and_start_container(&self) -> Result<()> {
        let status = Command::new("docker")
            .args([
                "run",
                "-d",
                "--name", &self.config.container_name,
                "-p", &format!("{}:6379", self.config.port),
                &self.config.docker_image,
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status()
            .await
            .map_err(|e| DependencyError::DockerError {
                message: format!("Failed to create container: {}", e),
            })?;

        if !status.success() {
            return Err(DependencyError::DockerError {
                message: format!("docker run failed for {}", self.config.docker_image),
            });
        }

        Ok(())
    }

    async fn wait_for_healthy(&self) -> Result<()> {
        self.checker
            .wait_for_tcp(self.config.port, "falkordb", self.config.startup_timeout)
            .await
    }

    pub fn is_enabled(&self) -> bool {
        self.config.mode != crate::config::DepMode::Manual
    }
}

impl Default for FalkorDBManager {
    fn default() -> Self {
        Self::new(FalkorDBDepConfig::default())
    }
}