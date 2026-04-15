use crate::checker::HealthChecker;
use crate::config::{DepMode, FalkorDBDepConfig};
use crate::container::ContainerEnvironment;
use crate::error::{DependencyError, Result};
use std::process::Stdio;
use tokio::process::Command;
use tracing::{debug, info, warn};

pub struct FalkorDBManager {
    config: FalkorDBDepConfig,
    checker: HealthChecker,
    container_env: ContainerEnvironment,
}

impl FalkorDBManager {
    pub fn new(config: FalkorDBDepConfig) -> Self {
        Self {
            config,
            checker: HealthChecker::new(),
            container_env: crate::container::detect_container(),
        }
    }

    pub fn with_container_env(config: FalkorDBDepConfig, container_env: ContainerEnvironment) -> Self {
        Self {
            config,
            checker: HealthChecker::new(),
            container_env,
        }
    }

    pub async fn ensure_running(&self) -> Result<()> {
        info!("Checking FalkorDB status (env: {})", self.container_env);
        
        let host = self.get_effective_host();
        let port = self.config.port;
        
        match self.checker.check_tcp_port_on_host(&host, port, "falkordb").await {
            Ok(_) => {
                info!("FalkorDB already running at {}:{}", host, port);
                Ok(())
            }
            Err(_) => {
                if self.can_spawn_container() {
                    debug!("FalkorDB not running, attempting to start container");
                    self.start_container().await?;
                    self.wait_for_healthy().await?;
                    info!("FalkorDB started successfully");
                    Ok(())
                } else {
                    warn!("FalkorDB not available and cannot spawn container from inside container");
                    warn!("Ensure FalkorDB is accessible at {}:{}", host, port);
                    Err(DependencyError::HealthCheckFailed {
                        service: "falkordb".to_string(),
                        message: format!(
                            "Not accessible at {}:{} and cannot spawn from {} environment. \
                            Set mode to 'external' or 'attach' and ensure FalkorDB is running.",
                            host, port, self.container_env
                        ),
                    })
                }
            }
        }
    }

    fn get_effective_host(&self) -> String {
        match self.config.mode {
            DepMode::External => self.config.host.clone(),
            DepMode::Container => {
                if self.config.host == "localhost" {
                    self.config.container_name.clone()
                } else {
                    self.config.host.clone()
                }
            },
            DepMode::Auto => {
                if self.container_env.is_containerized() {
                    "host.containers.internal".to_string()
                } else {
                    self.config.host.clone()
                }
            },
            _ => self.config.host.clone(),
        }
    }

    fn can_spawn_container(&self) -> bool {
        match self.config.mode {
            DepMode::Manual | DepMode::External | DepMode::Attach | DepMode::Container => false,
            DepMode::Spawn => self.container_env.can_spawn_containers() || self.container_env == ContainerEnvironment::None,
            DepMode::Auto => self.container_env.can_spawn_containers() || self.container_env == ContainerEnvironment::None,
        }
    }

    async fn get_container_command() -> &'static str {
        if Command::new("podman")
            .arg("--version")
            .output()
            .await
            .is_ok_and(|o| o.status.success())
        {
            "podman"
        } else {
            "docker"
        }
    }

    async fn start_container(&self) -> Result<()> {
        let cmd = Self::get_container_command().await;
        let container_exists = self.container_exists(cmd).await?;
        
        if container_exists {
            debug!("Container {} exists, starting it", self.config.container_name);
            self.start_existing_container(cmd).await?;
        } else {
            debug!("Container {} does not exist, creating it", self.config.container_name);
            self.create_and_start_container(cmd).await?;
        }
        
        Ok(())
    }

    async fn container_exists(&self, cmd: &str) -> Result<bool> {
        let output = Command::new(cmd)
            .args(["ps", "-a", "--filter", &format!("name={}", self.config.container_name), "--format", "{{.Names}}"])
            .output()
            .await
            .map_err(|e| DependencyError::DockerError {
                message: format!("Failed to check container: {}", e),
            })?;

        let names = String::from_utf8_lossy(&output.stdout);
        Ok(names.lines().any(|line| line == self.config.container_name))
    }

    async fn start_existing_container(&self, cmd: &str) -> Result<()> {
        let status = Command::new(cmd)
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
                message: format!("{} container start failed for {}", cmd, self.config.container_name),
            });
        }

        Ok(())
    }

    async fn create_and_start_container(&self, cmd: &str) -> Result<()> {
        let status = Command::new(cmd)
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
                message: format!("{} run failed for {}", cmd, self.config.docker_image),
            });
        }

        Ok(())
    }

    async fn wait_for_healthy(&self) -> Result<()> {
        let host = self.get_effective_host();
        self.checker
            .wait_for_tcp_on_host(&host, self.config.port, "falkordb", self.config.startup_timeout)
            .await
    }

    pub fn is_enabled(&self) -> bool {
        self.config.mode != DepMode::Manual
    }
}

impl Default for FalkorDBManager {
    fn default() -> Self {
        Self::new(FalkorDBDepConfig::default())
    }
}