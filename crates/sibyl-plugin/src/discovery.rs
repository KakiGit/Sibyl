use crate::skill::SKILL_SEARCH_PATHS;
use crate::workflow::WORKFLOW_SEARCH_PATHS;
use std::path::PathBuf;

pub struct PluginPaths {
    pub skills: Vec<PathBuf>,
    pub workflows: Vec<PathBuf>,
    pub tools: PathBuf,
    pub config: PathBuf,
}

impl Default for PluginPaths {
    fn default() -> Self {
        Self::new()
    }
}

impl PluginPaths {
    pub fn new() -> Self {
        Self {
            skills: SKILL_SEARCH_PATHS.iter().map(PathBuf::from).collect(),
            workflows: WORKFLOW_SEARCH_PATHS.iter().map(PathBuf::from).collect(),
            tools: PathBuf::from(".sibyl/tools"),
            config: PathBuf::from(".sibyl/config.yaml"),
        }
    }

    pub fn from_project_root(root: impl Into<PathBuf>) -> Self {
        let root = root.into();
        Self {
            skills: SKILL_SEARCH_PATHS.iter().map(|p| root.join(p)).collect(),
            workflows: WORKFLOW_SEARCH_PATHS.iter().map(|p| root.join(p)).collect(),
            tools: root.join(".sibyl/tools"),
            config: root.join(".sibyl/config.yaml"),
        }
    }

    pub fn with_skill_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.skills = paths;
        self
    }

    pub fn with_workflow_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.workflows = paths;
        self
    }

    pub fn with_tools_path(mut self, path: PathBuf) -> Self {
        self.tools = path;
        self
    }

    pub fn with_config_path(mut self, path: PathBuf) -> Self {
        self.config = path;
        self
    }

    pub fn global_skill_path() -> Option<PathBuf> {
        dirs::data_local_dir().map(|p| p.join("sibyl").join("skills"))
    }

    pub fn global_workflow_path() -> Option<PathBuf> {
        dirs::data_local_dir().map(|p| p.join("sibyl").join("workflows"))
    }

    pub fn discover_all_paths(root: Option<PathBuf>) -> Self {
        let base = Self::from_project_root(root.unwrap_or_default());

        let mut skills = base.skills.clone();
        if let Some(global) = Self::global_skill_path() {
            skills.push(global);
        }

        let mut workflows = base.workflows.clone();
        if let Some(global) = Self::global_workflow_path() {
            workflows.push(global);
        }

        Self {
            skills,
            workflows,
            tools: base.tools,
            config: base.config,
        }
    }
}

pub fn discover_config_files(root: Option<PathBuf>) -> Vec<PathBuf> {
    let mut configs = Vec::new();

    let project_config = root.unwrap_or_default().join(".sibyl/config.yaml");
    if project_config.exists() {
        configs.push(project_config);
    }

    let global_config = dirs::data_local_dir().map(|p| p.join("sibyl").join("config.yaml"));

    if let Some(gc) = global_config {
        if gc.exists() {
            configs.push(gc);
        }
    }

    configs
}
