use crate::error::{Error, Result};
use crate::workflow::{Action, Workflow, WorkflowContext, WorkflowResult, WorkflowStep, StepResult};
use std::collections::HashMap;

pub struct WorkflowExecutor {
    workflows: HashMap<String, Workflow>,
}

impl Default for WorkflowExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkflowExecutor {
    pub fn new() -> Self {
        Self {
            workflows: HashMap::new(),
        }
    }

    pub fn register(&mut self, workflow: Workflow) {
        self.workflows.insert(workflow.name.clone(), workflow);
    }

    pub fn unregister(&mut self, name: &str) {
        self.workflows.remove(name);
    }

    pub fn get(&self, name: &str) -> Option<&Workflow> {
        self.workflows.get(name)
    }

    pub fn list(&self) -> Vec<&Workflow> {
        self.workflows.values().collect()
    }

    pub async fn execute(
        &self,
        workflow_name: &str,
        variables: HashMap<String, serde_json::Value>,
    ) -> Result<WorkflowResult> {
        let workflow = self.workflows.get(workflow_name)
            .ok_or_else(|| Error::WorkflowNotFound(workflow_name.to_string()))?;

        self.validate_variables(workflow, &variables)?;

        let mut context = WorkflowContext::with_variables(variables);

        for step in &workflow.steps {
            match self.execute_step(step, &context).await {
                Ok(result) => {
                    context.set_result(&step.name, serde_json::to_value(&result).unwrap_or_default());
                }
                Err(e) => {
                    return Ok(WorkflowResult {
                        workflow: workflow_name.to_string(),
                        context,
                        success: false,
                        error: Some(e.to_string()),
                    });
                }
            }
        }

        Ok(WorkflowResult {
            workflow: workflow_name.to_string(),
            context,
            success: true,
            error: None,
        })
    }

    fn validate_variables(&self, workflow: &Workflow, variables: &HashMap<String, serde_json::Value>) -> Result<()> {
        for var_def in &workflow.variables {
            if var_def.required {
                if !variables.contains_key(&var_def.name) && var_def.default.is_none() {
                    return Err(Error::MissingVariable(var_def.name.clone()));
                }
            }
        }
        Ok(())
    }

    async fn execute_step(&self, step: &WorkflowStep, context: &WorkflowContext) -> Result<StepResult> {
        match step.action {
            Action::Prompt => {
                let rendered = context.render_template(&step.template);
                Ok(StepResult::success(&step.name, serde_json::json!({
                    "prompt": rendered
                })))
            }
            Action::Tool => {
                if step.tool.is_empty() {
                    return Err(Error::InvalidWorkflowStep("Tool name is required".into()));
                }

                let rendered_args = context.render_args(&step.args);

                Ok(StepResult::success(&step.name, serde_json::json!({
                    "tool": step.tool,
                    "args": rendered_args,
                    "message": "Tool execution requires ToolRegistry integration"
                })))
            }
        }
    }
}