use crate::Result;
use std::collections::HashMap;
use std::path::PathBuf;

pub struct Plugin {
    pub name: String,
    pub version: String,
    pub path: PathBuf,
}

impl Plugin {
    pub fn new(name: impl Into<String>, version: impl Into<String>, path: PathBuf) -> Self {
        Self {
            name: name.into(),
            version: version.into(),
            path,
        }
    }
}

pub struct PluginManager {
    plugins: HashMap<String, Plugin>,
    skills_dir: PathBuf,
    workflows_dir: PathBuf,
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            plugins: HashMap::new(),
            skills_dir: PathBuf::from("plugins/skills"),
            workflows_dir: PathBuf::from("plugins/workflows"),
        }
    }

    pub fn register(&mut self, plugin: Plugin) {
        self.plugins.insert(plugin.name.clone(), plugin);
    }

    pub fn unregister(&mut self, name: &str) {
        self.plugins.remove(name);
    }

    pub fn get(&self, name: &str) -> Option<&Plugin> {
        self.plugins.get(name)
    }

    pub fn list(&self) -> Vec<&Plugin> {
        self.plugins.values().collect()
    }
}