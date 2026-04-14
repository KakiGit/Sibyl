use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkflowContext {
    pub variables: HashMap<String, Value>,
    pub results: HashMap<String, Value>,
}

impl WorkflowContext {
    pub fn new() -> Self {
        Self {
            variables: HashMap::new(),
            results: HashMap::new(),
        }
    }

    pub fn with_variables(variables: HashMap<String, Value>) -> Self {
        Self {
            variables,
            results: HashMap::new(),
        }
    }

    pub fn set_variable(&mut self, key: impl Into<String>, value: Value) {
        self.variables.insert(key.into(), value);
    }

    pub fn get_variable(&self, key: &str) -> Option<&Value> {
        self.variables.get(key)
    }

    pub fn set_result(&mut self, step: impl Into<String>, value: Value) {
        self.results.insert(step.into(), value);
    }

    pub fn get_result(&self, step: &str) -> Option<&Value> {
        self.results.get(step)
    }

    pub fn render_template(&self, template: &str) -> String {
        let mut result = template.to_string();

        for (key, value) in &self.variables {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = value_to_string(value);
            result = result.replace(&placeholder, &replacement);
        }

        for (key, value) in &self.results {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = value_to_string(value);
            result = result.replace(&placeholder, &replacement);
        }

        result
    }

    pub fn render_args(&self, args: &HashMap<String, Value>) -> HashMap<String, Value> {
        args.iter()
            .map(|(k, v)| {
                let rendered = if let Some(s) = v.as_str() {
                    Value::String(self.render_template(s))
                } else {
                    v.clone()
                };
                (k.clone(), rendered)
            })
            .collect()
    }
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Array(arr) => arr
            .iter()
            .map(value_to_string)
            .collect::<Vec<_>>()
            .join(", "),
        Value::Object(obj) => obj
            .iter()
            .map(|(k, v)| format!("{}: {}", k, value_to_string(v)))
            .collect::<Vec<_>>()
            .join(", "),
        Value::Null => String::new(),
    }
}
