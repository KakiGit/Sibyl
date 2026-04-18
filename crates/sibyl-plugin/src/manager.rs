use crate::config::PluginConfig;
use crate::error::Result;
use crate::mcp::McpManager;
use crate::skill::{Skill, SkillLoader, SkillRegistry};
use crate::tool::{sibyl_memory_tools, ToolRegistry, ToolSpec};
use crate::workflow::{Workflow, WorkflowExecutor, WorkflowLoader};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct PluginManager {
    skill_registry: SkillRegistry,
    tool_registry: ToolRegistry,
    workflow_executor: WorkflowExecutor,
    mcp_manager: Arc<Mutex<McpManager>>,
    config: PluginConfig,
    paths: crate::discovery::PluginPaths,
}

impl Default for PluginManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            skill_registry: SkillRegistry::new(),
            tool_registry: ToolRegistry::new(),
            workflow_executor: WorkflowExecutor::new(),
            mcp_manager: Arc::new(Mutex::new(McpManager::new())),
            config: PluginConfig::default(),
            paths: crate::discovery::PluginPaths::new(),
        }
    }

    pub fn with_config(mut self, config: PluginConfig) -> Self {
        self.config = config;
        self
    }

    pub fn with_project_root(mut self, root: PathBuf) -> Self {
        self.paths = crate::discovery::PluginPaths::from_project_root(root);
        self
    }

    pub fn with_paths(mut self, paths: crate::discovery::PluginPaths) -> Self {
        self.paths = paths;
        self
    }

    pub fn with_tool_registry_for_workflow(mut self) -> Self {
        self.workflow_executor = WorkflowExecutor::new();
        self
    }

    pub async fn initialize(&mut self) -> Result<()> {
        self.load_skills()?;
        self.register_memory_tools();
        self.load_workflows()?;
        self.start_mcp_servers().await?;

        Ok(())
    }

    fn load_skills(&mut self) -> Result<()> {
        if !self.config.skills.autoload {
            return Ok(());
        }

        let loader = SkillLoader::with_paths(
            self.config
                .skills
                .search_paths
                .iter()
                .map(PathBuf::from)
                .collect(),
        );

        let skills = loader.discover_skills()?;

        for skill in skills {
            tracing::info!("Loaded skill: {}", skill.name);
            self.skill_registry.register(skill);
        }

        Ok(())
    }

    fn register_memory_tools(&mut self) {
        for executor in sibyl_memory_tools() {
            let spec = ToolSpec::new(
                executor.name(),
                format!("{} tool", executor.name()),
                serde_json::json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Query string"
                        }
                    },
                    "required": ["query"]
                }),
            );
            self.tool_registry.register_sibyl_tool(spec);
            self.tool_registry.register_executor(executor);
        }
    }

    fn load_workflows(&mut self) -> Result<()> {
        if !self.config.workflows.autoload {
            return Ok(());
        }

        let loader = WorkflowLoader::with_paths(
            self.config
                .workflows
                .search_paths
                .iter()
                .map(PathBuf::from)
                .collect(),
        );

        let workflows = loader.discover_workflows()?;

        for workflow in workflows {
            tracing::info!("Loaded workflow: {}", workflow.name);
            self.workflow_executor.register(workflow);
        }

        Ok(())
    }

    async fn start_mcp_servers(&mut self) -> Result<()> {
        let servers = self.config.enabled_mcp_servers();

        for server_config in servers {
            tracing::info!("Starting MCP server: {}", server_config.name);

            let mut manager = self.mcp_manager.lock().await;
            manager.add_server(server_config).await?;

            let tool_specs = manager.tool_specs();
            for spec in tool_specs {
                self.tool_registry
                    .register_mcp_tool(spec.clone(), spec.name.clone());
            }
        }

        Ok(())
    }

    pub fn skill_registry(&self) -> &SkillRegistry {
        &self.skill_registry
    }

    pub fn tool_registry(&self) -> &ToolRegistry {
        &self.tool_registry
    }

    pub fn workflow_executor(&self) -> &WorkflowExecutor {
        &self.workflow_executor
    }

    pub fn mcp_manager(&self) -> &Arc<Mutex<McpManager>> {
        &self.mcp_manager
    }

    pub fn register_skill(&mut self, skill: Skill) {
        self.skill_registry.register(skill);
    }

    pub fn unregister_skill(&mut self, name: &str) {
        self.skill_registry.unregister(name);
    }

    pub fn get_skill(&self, name: &str) -> Option<&Skill> {
        self.skill_registry.get(name)
    }

    pub fn list_skills(&self) -> Vec<&Skill> {
        self.skill_registry.list()
    }

    pub fn register_workflow(&mut self, workflow: Workflow) {
        self.workflow_executor.register(workflow);
    }

    pub fn unregister_workflow(&mut self, name: &str) {
        self.workflow_executor.unregister(name);
    }

    pub fn get_workflow(&self, name: &str) -> Option<&Workflow> {
        self.workflow_executor.get(name)
    }

    pub fn list_workflows(&self) -> Vec<&Workflow> {
        self.workflow_executor.list()
    }

    pub fn register_harness_tool(&mut self, tool: ToolSpec) {
        self.tool_registry.register_harness_tool(tool);
    }

    pub fn register_sibyl_tool(&mut self, tool: ToolSpec) {
        self.tool_registry.register_sibyl_tool(tool);
    }

    pub fn list_tools(&self) -> Vec<&ToolSpec> {
        self.tool_registry.all_tools()
    }

    pub async fn execute_workflow(
        &self,
        name: &str,
        variables: HashMap<String, serde_json::Value>,
    ) -> Result<crate::workflow::WorkflowResult> {
        self.workflow_executor.execute(name, variables).await
    }

    pub async fn shutdown(&mut self) -> Result<()> {
        let mut manager = self.mcp_manager.lock().await;
        manager.stop_all().await;

        self.tool_registry.clear();
        self.skill_registry.clear();

        Ok(())
    }
}
