use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub tools_required: Vec<String>,
    pub source_path: PathBuf,
}

impl Skill {
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        instructions: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            instructions: instructions.into(),
            tools_required: Vec::new(),
            source_path: PathBuf::new(),
        }
    }

    pub fn with_tools(mut self, tools: Vec<String>) -> Self {
        self.tools_required = tools;
        self
    }

    pub fn with_source_path(mut self, path: PathBuf) -> Self {
        self.source_path = path;
        self
    }

    pub fn requires_memory(&self) -> bool {
        self.tools_required.iter().any(|t| t.starts_with("memory_"))
    }
}
