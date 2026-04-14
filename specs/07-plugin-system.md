# Plugin System Specification

## Plugin Types

| Type | Description | Format | Location |
|------|-------------|--------|----------|
| Skills | Instruction sets loaded into context | `SKILL.md` | `.sibyl/skills/`, `.claude/skills/`, `.opencode/skills/` |
| Tools | External functions callable by LLM | MCP server | `.sibyl/tools/` or MCP registry |
| Workflows | Multi-step automation scripts | `workflow.yaml` | `.sibyl/workflows/` |

## Skill System

### Skill Discovery Paths

Sibyl searches for skills in multiple locations (compatible with other tools):

```rust
pub const SKILL_SEARCH_PATHS: &[&str] = &[
    ".sibyl/skills/",      // Sibyl-specific skills
    ".claude/skills/",     // Claude Code compatibility
    ".opencode/skills/",   // OpenCode compatibility
    "~/.sibyl/skills/",    // User global skills
];
```

### SKILL.md Format

Skills are markdown files with structured sections:

```markdown
# Skill: Code Review

## Description
Perform structured code review with memory-aware context.
Checks past decisions and applies consistent review criteria.

## Instructions

When reviewing code:
1. Check memory for past review decisions and preferences
2. Identify the file's purpose from recent context
3. Evaluate against project style guidelines
4. Provide actionable feedback

## Tools Required
- read_file
- grep_search  
- memory_query (Sibyl-specific)

## Example

User: "Review src/main.rs"

Assistant:
1. Reads memory: "User prefers functional style"
2. Reads file: src/main.rs
3. Reviews against preferences
4. Outputs review with specific suggestions
```

### Skill Loading

```rust
pub struct SkillLoader {
    search_paths: Vec<PathBuf>,
}

impl SkillLoader {
    pub fn discover_skills(&self) -> Result<Vec<Skill>> {
        let mut skills = Vec::new();
        
        for path in &self.search_paths {
            if path.exists() {
                for entry in fs::read_dir(path)? {
                    let file = entry?.path();
                    if file.extension() == Some("md") {
                        let skill = self.parse_skill(&file)?;
                        skills.push(skill);
                    }
                }
            }
        }
        
        Ok(skills)
    }
    
    fn parse_skill(&self, path: &Path) -> Result<Skill> {
        let content = fs::read_to_string(path)?;
        
        // Parse markdown sections
        let name = extract_heading(&content, 1)?;  // # Skill: Name
        let description = extract_section(&content, "## Description")?;
        let instructions = extract_section(&content, "## Instructions")?;
        let tools = extract_section(&content, "## Tools Required")
            .map(|s| parse_tool_list(s))
            .unwrap_or_default();
        
        Ok(Skill {
            name,
            description,
            instructions,
            tools_required: tools,
            source_path: path.clone(),
        })
    }
}
```

### Skill Registry

```rust
pub struct SkillRegistry {
    skills: HashMap<String, Skill>,
}

impl SkillRegistry {
    pub fn get(&self, name: &str) -> Option<&Skill> {
        self.skills.get(name)
    }
    
    pub fn list(&self) -> Vec<&Skill> {
        self.skills.values().collect()
    }
    
    pub fn instructions_for(&self, name: &str) -> Option<String> {
        self.skills.get(name).map(|s| s.instructions.clone())
    }
}
```

### Skill Usage in Prompts

When a skill is activated, its instructions are injected:

```jinja2
# ACTIVE SKILL: {{ skill_name }}
{{ skill_instructions }}

# MEMORY CONTEXT (for skill)
{% if skill.tools_required contains "memory_query" %}
{% include "memory_context.jinja2" %}
{% endif %}
```

## Tool Registry

### Built-in Tools

Sibyl provides memory-related tools alongside harness tools:

| Tool | Description | Implementation |
|------|-------------|----------------|
| `memory_query` | Search memories | Python IPC |
| `memory_add` | Add memory | Python IPC |
| `skill_load` | Load a skill | Rust plugin manager |

### MCP Tool Integration

External tools via MCP servers:

```yaml
# .sibyl/tools.yaml
mcp_servers:
  - name: "filesystem"
    command: "mcp-server-filesystem"
    args: ["--root", "/home/user/projects"]
    
  - name: "github"
    command: "mcp-server-github"
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"
```

### Tool Registration Flow

```
1. Harness provides its tools (OpenCode tools)
2. Sibyl adds memory tools
3. MCP servers register their tools
4. Combined tool list sent to LLM
```

```rust
pub struct ToolRegistry {
    harness_tools: Vec<ToolSpec>,
    sibyl_tools: Vec<ToolSpec>,
    mcp_tools: HashMap<String, Vec<ToolSpec>>,
}

impl ToolRegistry {
    pub fn all_tools(&self) -> Vec<ToolSpec> {
        let mut tools = self.harness_tools.clone();
        tools.extend(self.sibyl_tools.clone());
        for mcp_tools in self.mcp_tools.values() {
            tools.extend(mcp_tools.clone());
        }
        tools
    }
    
    pub fn execute(&self, tool_name: &str, args: Value) -> Result<Value> {
        if tool_name.starts_with("memory_") {
            self.execute_memory_tool(tool_name, args)
        } else if let Some(server) = self.find_mcp_server(tool_name) {
            self.execute_mcp_tool(server, tool_name, args)
        } else {
            self.harness.execute_tool(tool_name, args)
        }
    }
}
```

## Workflow System

### Workflow Definition Format

```yaml
# .sibyl/workflows/fix-and-remember.yaml
name: fix-and-remember
description: Fix an issue and record the decision in memory

steps:
  - name: analyze
    action: prompt
    template: |
      Analyze this issue: {{ issue }}
      Consider past decisions from memory.
      
  - name: search_memory
    action: tool
    tool: memory_query
    args:
      query: "{{ issue }} related decisions"
      
  - name: implement_fix
    action: tool
    tool: edit_file
    args:
      path: "{{ file_path }}"
      changes: "{{ analysis.fix }}"
      
  - name: verify
    action: tool
    tool: bash
    args:
      command: "{{ verify_command }}"
      
  - name: remember
    action: tool
    tool: memory_add
    args:
      content: |
        Fixed {{ issue }} in {{ file_path }}
        Decision: {{ analysis.reason }}
        Result: {{ verify.result }}
        
variables:
  - issue        # Required: description of the issue
  - file_path    # Required: file to modify
  - verify_command  # Optional: verification command
```

### Workflow Executor

```rust
pub struct WorkflowExecutor {
    workflows: HashMap<String, Workflow>,
}

impl WorkflowExecutor {
    pub async fn execute(
        &self,
        workflow_name: &str,
        variables: HashMap<String, String>
    ) -> Result<WorkflowResult> {
        let workflow = self.workflows.get(workflow_name)?;
        
        let mut context = WorkflowContext {
            variables,
            results: HashMap::new(),
        };
        
        for step in &workflow.steps {
            let result = self.execute_step(step, &context).await?;
            context.results.insert(step.name.clone(), result);
        }
        
        Ok(WorkflowResult {
            workflow: workflow_name,
            context,
        })
    }
    
    async fn execute_step(
        &self,
        step: &WorkflowStep,
        context: &WorkflowContext
    ) -> Result<StepResult> {
        match step.action {
            Action::Prompt => {
                let template = render_template(&step.template, context)?;
                // Send to harness
                self.harness.send_message(template).await
            },
            Action::Tool => {
                let args = render_args(&step.args, context)?;
                self.tool_registry.execute(&step.tool, args).await
            },
        }
    }
}
```

### Workflow Discovery

```rust
pub fn discover_workflows(paths: &[PathBuf]) -> Result<Vec<Workflow>> {
    let mut workflows = Vec::new();
    
    for path in paths {
        if path.exists() {
            for entry in fs::read_dir(path)? {
                let file = entry?.path();
                if file.extension() == Some("yaml") || file.extension() == Some("yml") {
                    let content = fs::read_to_string(&file)?;
                    let workflow: Workflow = serde_yaml::from_str(&content)?;
                    workflows.push(workflow);
                }
            }
        }
    }
    
    Ok(workflows)
}
```

## Plugin Manager Architecture

```
┌─────────────────────────────────────────┐
│          Plugin Manager (Rust)           │
├─────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐       │
│  │ SkillLoader │  │ToolRegistry │       │
│  └─────────────┘  └─────────────┘       │
│  ┌─────────────┐  ┌─────────────┐       │
│  │WorkflowExec │  │ MCP Manager │       │
│  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌─────────────────┐ ┌─────────────────────┐
│  Skill Files    │ │  MCP Servers        │
│  (SKILL.md)     │ │  (external process) │
└─────────────────┘ └─────────────────────┘
```

## Built-in Skills

### Default Skills (included with Sibyl)

```markdown
# Skill: Memory Query

## Description
Query and utilize stored memories for context-aware assistance.

## Instructions
Before responding:
1. Query memory for relevant facts about the user/project
2. Check for past decisions related to the task
3. Apply consistent preferences from memory

## Tools Required
- memory_query

---

# Skill: Code with Memory

## Description
Write code that respects past decisions and preferences.

## Instructions
1. Query memory for coding style preferences
2. Check for architectural decisions from past sessions
3. Apply consistent patterns
4. After completion, add new decisions to memory

## Tools Required
- memory_query
- memory_add

---

# Skill: Debug Trace

## Description
Debug issues with memory of similar past problems.

## Instructions
1. Search memory for similar error patterns
2. Check past solutions that worked
3. Apply proven debugging approaches
4. Record successful fix in memory

## Tools Required
- memory_query
- memory_add
- grep
- bash
```

## Plugin Configuration

```yaml
# .sibyl/config.yaml
plugins:
  skills:
    autoload: true            # Auto-load skills on startup
    search_paths:
      - .sibyl/skills
      - .claude/skills
      - .opencode/skills
      
  workflows:
    autoload: true
    search_paths:
      - .sibyl/workflows
      
  mcp_servers:
    - name: filesystem
      enabled: true
      command: mcp-server-filesystem
      args: ["--root", "."]
      
    - name: github
      enabled: false      # Disabled by default
      command: mcp-server-github
```

## Crate Structure

```
sibyl-plugin/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── manager.rs            # Main plugin manager
│   ├── skill/
│   │   ├── mod.rs
│   │   ├── loader.rs         # SKILL.md parsing
│   │   ├── registry.rs       # Skill storage
│   │   ├── parser.rs         # Markdown parser
│   │   └── types.rs          # Skill types
│   ├── tool/
│   │   ├── mod.rs
│   │   ├── registry.rs       # Tool storage
│   │   ├── memory_tools.rs   # Sibyl memory tools
│   │   └── types.rs          # Tool types
│   ├── workflow/
│   │   ├── mod.rs
│   │   ├── loader.rs         # YAML parsing
│   │   ├── executor.rs       # Step execution
│   │   ├── context.rs        # Variable context
│   │   └── types.rs          # Workflow types
│   ├── mcp/
│   │   ├── mod.rs
│   │   ├── manager.rs        # MCP server management
│   │   ├── client.rs         # MCP protocol client
│   │   └── types.rs          # MCP types
│   ├── discovery.rs          # Path discovery
│   ├── config.rs             # Plugin config
│   └── error.rs              # Errors
```

## Dependencies

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_yaml = "0.9"             # Workflow parsing
pulldown-cmark = "0.12"        # SKILL.md parsing
tokio = { version = "1", features = ["process"] }
async-trait = "0.1"
tracing = "0.1"
thiserror = "1"
```