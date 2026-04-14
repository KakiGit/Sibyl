use crate::types::{PermissionDecision, PermissionResponse};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub id: String,
    pub tool: String,
    pub action: String,
    pub description: Option<String>,
}

impl PermissionRequest {
    pub fn new(id: impl Into<String>, tool: impl Into<String>, action: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            tool: tool.into(),
            action: action.into(),
            description: None,
        }
    }

    pub fn with_description(mut self, desc: impl Into<String>) -> Self {
        self.description = Some(desc.into());
        self
    }
}

pub struct PermissionHandler {
    always_allow: Vec<String>,
}

impl PermissionHandler {
    pub fn new() -> Self {
        Self {
            always_allow: Vec::new(),
        }
    }

    pub fn add_always_allow(&mut self, action: impl Into<String>) {
        self.always_allow.push(action.into());
    }

    pub fn check_memory(&self, action: &str) -> Option<PermissionDecision> {
        if self.always_allow.iter().any(|a| action.contains(a)) {
            Some(PermissionDecision::AllowAlways)
        } else {
            None
        }
    }

    pub fn create_response(
        &self,
        request: &PermissionRequest,
        decision: PermissionDecision,
    ) -> PermissionResponse {
        PermissionResponse {
            decision,
            request_id: request.id.clone(),
        }
    }
}

impl Default for PermissionHandler {
    fn default() -> Self {
        Self::new()
    }
}
