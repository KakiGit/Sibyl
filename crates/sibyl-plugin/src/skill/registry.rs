use crate::skill::Skill;
use std::collections::HashMap;

pub struct SkillRegistry {
    skills: HashMap<String, Skill>,
}

impl Default for SkillRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl SkillRegistry {
    pub fn new() -> Self {
        Self {
            skills: HashMap::new(),
        }
    }

    pub fn register(&mut self, skill: Skill) {
        self.skills.insert(skill.name.clone(), skill);
    }

    pub fn unregister(&mut self, name: &str) {
        self.skills.remove(name);
    }

    pub fn get(&self, name: &str) -> Option<&Skill> {
        self.skills.get(name)
    }

    pub fn list(&self) -> Vec<&Skill> {
        self.skills.values().collect()
    }

    pub fn list_names(&self) -> Vec<&str> {
        self.skills.keys().map(|s| s.as_str()).collect()
    }

    pub fn instructions_for(&self, name: &str) -> Option<String> {
        self.skills.get(name).map(|s| s.instructions.clone())
    }

    pub fn clear(&mut self) {
        self.skills.clear();
    }

    pub fn len(&self) -> usize {
        self.skills.len()
    }

    pub fn is_empty(&self) -> bool {
        self.skills.is_empty()
    }
}
