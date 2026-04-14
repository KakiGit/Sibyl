use std::path::PathBuf;

use super::types::Config;
use crate::Result;

pub struct ConfigLoader {
    config_dir: PathBuf,
}

impl ConfigLoader {
    pub fn new(config_dir: impl Into<PathBuf>) -> Self {
        Self {
            config_dir: config_dir.into(),
        }
    }

    pub fn config_path(&self) -> PathBuf {
        self.config_dir.join("sibyl.yaml")
    }

    pub async fn load(&self) -> Result<Config> {
        let path = self.config_path();
        
        if !path.exists() {
            return Ok(Config::default());
        }
        
        let contents = tokio::fs::read_to_string(&path).await?;
        let config: Config = serde_yaml::from_str(&contents)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        
        Ok(config)
    }

    pub async fn save(&self, config: &Config) -> Result<()> {
        tokio::fs::create_dir_all(&self.config_dir).await?;
        
        let contents = serde_yaml::to_string(config)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        
        let path = self.config_path();
        tokio::fs::write(&path, contents).await?;
        
        Ok(())
    }

    pub fn default_config_dir() -> PathBuf {
        directories::ProjectDirs::from("com", "sibyl", "sibyl")
            .map(|dirs| dirs.config_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from(".sibyl"))
    }
}

impl Default for ConfigLoader {
    fn default() -> Self {
        Self::new(Self::default_config_dir())
    }
}