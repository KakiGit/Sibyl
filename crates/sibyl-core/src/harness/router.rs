use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, warn};

use super::trait_::Harness;
use super::types::{HarnessType, SessionConfig};
use crate::session::SessionId;

pub struct HarnessRouter {
    harnesses: Arc<RwLock<HashMap<HarnessType, Arc<dyn Harness>>>>,
    active: Arc<RwLock<Option<HarnessType>>>,
}

impl HarnessRouter {
    pub fn new() -> Self {
        Self {
            harnesses: Arc::new(RwLock::new(HashMap::new())),
            active: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn register(&self, harness_type: HarnessType, harness: Arc<dyn Harness>) {
        debug!("Registering harness: {:?}", harness_type);
        self.harnesses.write().await.insert(harness_type, harness);
    }

    pub async fn unregister(&self, harness_type: &HarnessType) {
        self.harnesses.write().await.remove(harness_type);
    }

    pub async fn set_active(&self, harness_type: HarnessType) -> Result<(), String> {
        let harnesses = self.harnesses.read().await;
        if harnesses.contains_key(&harness_type) {
            *self.active.write().await = Some(harness_type);
            debug!("Set active harness: {:?}", harness_type);
            Ok(())
        } else {
            Err(format!("Harness {:?} not registered", harness_type))
        }
    }

    pub async fn get_active(&self) -> Option<Arc<dyn Harness>> {
        let active = self.active.read().await.clone()?;
        let harnesses = self.harnesses.read().await;
        harnesses.get(&active).cloned()
    }

    pub async fn get(&self, harness_type: &HarnessType) -> Option<Arc<dyn Harness>> {
        self.harnesses.read().await.get(harness_type).cloned()
    }

    pub async fn create_session(&self, config: SessionConfig) -> Result<SessionId, String> {
        let harness = self.get(&config.harness).await
            .ok_or_else(|| format!("Harness {:?} not found", config.harness))?;
        
        harness.create_session(config).await
    }

    pub async fn list_available(&self) -> Vec<HarnessType> {
        self.harnesses.read().await.keys().cloned().collect()
    }

    pub async fn check_availability(&self) {
        let harnesses = self.harnesses.read().await;
        for (htype, harness) in harnesses.iter() {
            let available = harness.is_available();
            if !available {
                warn!("Harness {:?} is not available", htype);
            }
        }
    }
}

impl Default for HarnessRouter {
    fn default() -> Self {
        Self::new()
    }
}