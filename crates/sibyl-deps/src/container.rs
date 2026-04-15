use std::fmt;
use std::path::Path;
use tracing::debug;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainerEnvironment {
    None,
    Docker,
    Podman,
    Kubernetes,
    UnknownContainer,
}

impl fmt::Display for ContainerEnvironment {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ContainerEnvironment::None => write!(f, "host"),
            ContainerEnvironment::Docker => write!(f, "docker"),
            ContainerEnvironment::Podman => write!(f, "podman"),
            ContainerEnvironment::Kubernetes => write!(f, "kubernetes"),
            ContainerEnvironment::UnknownContainer => write!(f, "container"),
        }
    }
}

impl ContainerEnvironment {
    pub fn is_containerized(&self) -> bool {
        *self != ContainerEnvironment::None
    }

    pub fn can_spawn_containers(&self) -> bool {
        match self {
            ContainerEnvironment::None => true,
            ContainerEnvironment::Podman => true,
            ContainerEnvironment::Docker
            | ContainerEnvironment::Kubernetes
            | ContainerEnvironment::UnknownContainer => false,
        }
    }
}

pub fn detect_container() -> ContainerEnvironment {
    debug!("Detecting container environment");

    if Path::new("/.dockerenv").exists() {
        debug!("Found /.dockerenv - running in Docker");
        return ContainerEnvironment::Docker;
    }

    if let Ok(cgroup) = std::fs::read_to_string("/proc/1/cgroup") {
        if cgroup.contains("docker") {
            debug!("Found docker in cgroup - running in Docker");
            return ContainerEnvironment::Docker;
        }
        if cgroup.contains("podman") || cgroup.contains("libpod") {
            debug!("Found podman in cgroup - running in Podman");
            return ContainerEnvironment::Podman;
        }
        if cgroup.contains("kubepods") || cgroup.contains("kubernetes") {
            debug!("Found kubernetes in cgroup - running in Kubernetes");
            return ContainerEnvironment::Kubernetes;
        }
        if cgroup.contains("containerd") {
            debug!("Found containerd in cgroup - running in container");
            return ContainerEnvironment::UnknownContainer;
        }
    }

    if std::env::var("container").is_ok() {
        let container_var = std::env::var("container").unwrap_or_default();
        if container_var == "docker" {
            return ContainerEnvironment::Docker;
        }
        if container_var == "podman" {
            return ContainerEnvironment::Podman;
        }
        debug!("Found container env var: {}", container_var);
        return ContainerEnvironment::UnknownContainer;
    }

    if std::env::var("KUBERNETES_SERVICE_HOST").is_ok() {
        debug!("Found KUBERNETES_SERVICE_HOST - running in Kubernetes");
        return ContainerEnvironment::Kubernetes;
    }

    debug!("No container markers found - running on host");
    ContainerEnvironment::None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_containerized() {
        assert!(!ContainerEnvironment::None.is_containerized());
        assert!(ContainerEnvironment::Docker.is_containerized());
        assert!(ContainerEnvironment::Podman.is_containerized());
        assert!(ContainerEnvironment::Kubernetes.is_containerized());
    }

    #[test]
    fn test_can_spawn_containers() {
        assert!(ContainerEnvironment::None.can_spawn_containers());
        assert!(ContainerEnvironment::Podman.can_spawn_containers());
        assert!(!ContainerEnvironment::Docker.can_spawn_containers());
        assert!(!ContainerEnvironment::Kubernetes.can_spawn_containers());
    }
}
