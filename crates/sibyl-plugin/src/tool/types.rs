use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    #[serde(default)]
    pub source: ToolSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ToolSource {
    #[default]
    Harness,
    Sibyl,
    Mcp {
        server: String,
    },
}

impl ToolSpec {
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        input_schema: Value,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_schema,
            source: ToolSource::Sibyl,
        }
    }

    pub fn harness(
        name: impl Into<String>,
        description: impl Into<String>,
        input_schema: Value,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_schema,
            source: ToolSource::Harness,
        }
    }

    pub fn mcp(
        name: impl Into<String>,
        description: impl Into<String>,
        input_schema: Value,
        server: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_schema,
            source: ToolSource::Mcp {
                server: server.into(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: Value,
    #[serde(default)]
    pub error: Option<String>,
}

impl ToolResult {
    pub fn success(output: Value) -> Self {
        Self {
            success: true,
            output,
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            output: Value::Null,
            error: Some(message.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub arguments: Value,
    pub call_id: Option<String>,
}

impl ToolCall {
    pub fn new(name: impl Into<String>, arguments: Value) -> Self {
        Self {
            name: name.into(),
            arguments,
            call_id: None,
        }
    }

    pub fn with_call_id(mut self, id: impl Into<String>) -> Self {
        self.call_id = Some(id.into());
        self
    }
}
