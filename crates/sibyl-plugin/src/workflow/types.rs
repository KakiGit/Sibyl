use crate::workflow::WorkflowContext;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub steps: Vec<WorkflowStep>,
    #[serde(default)]
    pub variables: Vec<VariableDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub name: String,
    #[serde(rename = "type", default = "default_step_type")]
    pub step_type: StepType,
    pub action: Action,
    #[serde(default)]
    pub args: HashMap<String, Value>,
    #[serde(default)]
    pub template: String,
    #[serde(default)]
    pub tool: String,
    #[serde(default)]
    pub condition: Option<String>,
}

fn default_step_type() -> StepType {
    StepType::Action
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum StepType {
    Action,
    Prompt,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Prompt,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableDef {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default: Option<Value>,
}

impl Workflow {
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            steps: Vec::new(),
            variables: Vec::new(),
        }
    }

    pub fn add_step(mut self, step: WorkflowStep) -> Self {
        self.steps.push(step);
        self
    }

    pub fn with_variable(mut self, var: VariableDef) -> Self {
        self.variables.push(var);
        self
    }
}

impl WorkflowStep {
    pub fn new(name: impl Into<String>, action: Action) -> Self {
        Self {
            name: name.into(),
            step_type: StepType::Action,
            action,
            args: HashMap::new(),
            template: String::new(),
            tool: String::new(),
            condition: None,
        }
    }

    pub fn prompt(name: impl Into<String>, template: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            step_type: StepType::Prompt,
            action: Action::Prompt,
            args: HashMap::new(),
            template: template.into(),
            tool: String::new(),
            condition: None,
        }
    }

    pub fn tool(name: impl Into<String>, tool_name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            step_type: StepType::Tool,
            action: Action::Tool,
            args: HashMap::new(),
            template: String::new(),
            tool: tool_name.into(),
            condition: None,
        }
    }

    pub fn with_args(mut self, args: HashMap<String, Value>) -> Self {
        self.args = args;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowResult {
    pub workflow: String,
    pub context: WorkflowContext,
    pub success: bool,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step: String,
    pub success: bool,
    pub output: Value,
    #[serde(default)]
    pub error: Option<String>,
}

impl StepResult {
    pub fn success(step: impl Into<String>, output: Value) -> Self {
        Self {
            step: step.into(),
            success: true,
            output,
            error: None,
        }
    }

    pub fn error(step: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            step: step.into(),
            success: false,
            output: Value::Null,
            error: Some(message.into()),
        }
    }
}
