use crate::error::{Error, Result};
use crate::workflow::Workflow;
use std::fs;
use std::path::{Path, PathBuf};

pub const WORKFLOW_SEARCH_PATHS: &[&str] = &[".sibyl/workflows/"];

pub struct WorkflowLoader {
    search_paths: Vec<PathBuf>,
}

impl Default for WorkflowLoader {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkflowLoader {
    pub fn new() -> Self {
        let search_paths = WORKFLOW_SEARCH_PATHS.iter().map(PathBuf::from).collect();

        Self { search_paths }
    }

    pub fn with_paths(paths: Vec<PathBuf>) -> Self {
        Self {
            search_paths: paths,
        }
    }

    pub fn discover_workflows(&self) -> Result<Vec<Workflow>> {
        let mut workflows = Vec::new();

        for path in &self.search_paths {
            if path.exists() {
                self.load_workflows_from_dir(path, &mut workflows)?;
            }
        }

        Ok(workflows)
    }

    fn load_workflows_from_dir(&self, dir: &Path, workflows: &mut Vec<Workflow>) -> Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "yaml" || ext == "yml" {
                        match self.parse_workflow(&path) {
                            Ok(workflow) => workflows.push(workflow),
                            Err(e) => {
                                tracing::warn!("Failed to parse workflow {:?}: {}", path, e);
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    pub fn parse_workflow(&self, path: &Path) -> Result<Workflow> {
        let content = fs::read_to_string(path)?;
        let workflow: Workflow = serde_yaml::from_str(&content).map_err(|e| {
            Error::ParseError(format!("Failed to parse workflow {:?}: {}", path, e))
        })?;
        Ok(workflow)
    }

    pub fn search_paths(&self) -> &[PathBuf] {
        &self.search_paths
    }
}
