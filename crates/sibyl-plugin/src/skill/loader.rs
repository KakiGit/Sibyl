use crate::error::{Error, Result};
use crate::skill::{
    extract_heading, extract_name_from_heading, extract_section, parse_tool_list, Skill,
};
use std::fs;
use std::path::{Path, PathBuf};

pub const SKILL_SEARCH_PATHS: &[&str] = &[".sibyl/skills/", ".claude/skills/", ".opencode/skills/"];

pub struct SkillLoader {
    search_paths: Vec<PathBuf>,
}

impl Default for SkillLoader {
    fn default() -> Self {
        Self::new()
    }
}

impl SkillLoader {
    pub fn new() -> Self {
        let search_paths = SKILL_SEARCH_PATHS
            .iter()
            .map(|p| PathBuf::from(p))
            .chain(std::iter::once(
                dirs::data_local_dir()
                    .map(|p| p.join("sibyl").join("skills"))
                    .unwrap_or_default(),
            ))
            .collect();

        Self { search_paths }
    }

    pub fn with_paths(paths: Vec<PathBuf>) -> Self {
        Self {
            search_paths: paths,
        }
    }

    pub fn discover_skills(&self) -> Result<Vec<Skill>> {
        let mut skills = Vec::new();

        for path in &self.search_paths {
            if path.exists() {
                self.load_skills_from_dir(path, &mut skills)?;
            }
        }

        Ok(skills)
    }

    fn load_skills_from_dir(&self, dir: &Path, skills: &mut Vec<Skill>) -> Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "md" {
                        match self.parse_skill(&path) {
                            Ok(skill) => skills.push(skill),
                            Err(e) => {
                                tracing::warn!("Failed to parse skill {:?}: {}", path, e);
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    pub fn parse_skill(&self, path: &Path) -> Result<Skill> {
        let content = fs::read_to_string(path)?;

        let heading = extract_heading(&content, 1)?;
        let name = extract_name_from_heading(&heading);

        if name.is_empty() {
            return Err(Error::ParseError(format!(
                "No skill name found in {:?}",
                path
            )));
        }

        let description = extract_section(&content, "## Description").unwrap_or_default();

        let instructions = extract_section(&content, "## Instructions").unwrap_or_default();

        let tools = extract_section(&content, "## Tools Required")
            .map(|s| parse_tool_list(&s))
            .unwrap_or_default();

        Ok(Skill {
            name,
            description,
            instructions,
            tools_required: tools,
            source_path: path.to_path_buf(),
        })
    }

    pub fn search_paths(&self) -> &[PathBuf] {
        &self.search_paths
    }
}
