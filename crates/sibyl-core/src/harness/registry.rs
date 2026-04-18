use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::trait_::ToolSpec;
use super::types::HarnessType;

pub struct HarnessRegistry {
    specs: Arc<RwLock<HashMap<HarnessType, HarnessSpec>>>,
}

#[derive(Debug, Clone)]
pub struct HarnessSpec {
    pub harness_type: HarnessType,
    pub name: String,
    pub description: String,
    pub tools: Vec<ToolSpec>,
    pub available: bool,
}

impl HarnessRegistry {
    pub fn new() -> Self {
        Self {
            specs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register(&self, spec: HarnessSpec) {
        self.specs.write().await.insert(spec.harness_type, spec);
    }

    pub async fn get(&self, harness_type: &HarnessType) -> Option<HarnessSpec> {
        self.specs.read().await.get(harness_type).cloned()
    }

    pub async fn list(&self) -> Vec<HarnessSpec> {
        self.specs.read().await.values().cloned().collect()
    }

    pub async fn update_availability(&self, harness_type: &HarnessType, available: bool) {
        if let Some(spec) = self.specs.write().await.get_mut(harness_type) {
            spec.available = available;
        }
    }
}

impl Default for HarnessRegistry {
    fn default() -> Self {
        Self::new()
    }
}