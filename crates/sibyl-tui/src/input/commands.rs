use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Help,
    Skill(String),
    MemoryQuery(String),
    Remember(String),
    SwitchHarness(String),
    Clear,
    Unknown(String),
}

impl Command {
    pub fn parse(input: &str) -> Option<Self> {
        let trimmed = input.trim();
        if !trimmed.starts_with('/') {
            return None;
        }

        let without_slash = &trimmed[1..];
        let parts: Vec<&str> = without_slash.splitn(2, ' ').collect();
        let cmd = parts.get(0).copied().unwrap_or("");
        let args = parts.get(1).copied().unwrap_or("");

        Some(match cmd {
            "help" | "h" | "?" => Command::Help,
            "skill" | "s" => Command::Skill(args.to_string()),
            "memory" | "mem" | "m" => {
                if args.starts_with("query ") {
                    Command::MemoryQuery(args[6..].to_string())
                } else {
                    Command::MemoryQuery(args.to_string())
                }
            }
            "remember" | "r" => Command::Remember(args.to_string()),
            "switch-harness" | "switch" | "sh" => Command::SwitchHarness(args.to_string()),
            "clear" | "c" => Command::Clear,
            _ => Command::Unknown(trimmed.to_string()),
        })
    }

    #[allow(dead_code)]
    pub fn name(&self) -> &'static str {
        match self {
            Command::Help => "help",
            Command::Skill(_) => "skill",
            Command::MemoryQuery(_) => "memory query",
            Command::Remember(_) => "remember",
            Command::SwitchHarness(_) => "switch-harness",
            Command::Clear => "clear",
            Command::Unknown(_) => "unknown",
        }
    }

    #[allow(dead_code)]
    pub fn description(&self) -> &'static str {
        match self {
            Command::Help => "Show available commands",
            Command::Skill(_) => "Load a skill by name",
            Command::MemoryQuery(_) => "Search memories",
            Command::Remember(_) => "Remember a fact",
            Command::SwitchHarness(_) => "Switch to a different harness",
            Command::Clear => "Clear chat history",
            Command::Unknown(_) => "Unknown command",
        }
    }
}

pub fn get_command_help() -> HashMap<&'static str, &'static str> {
    let mut help = HashMap::new();
    help.insert("/help, /h, /?", "Show available commands");
    help.insert("/skill <name>, /s <name>", "Load a skill by name");
    help.insert("/memory query <text>, /m <text>", "Search memories");
    help.insert("/remember <fact>, /r <fact>", "Remember a fact");
    help.insert("/switch-harness <name>, /sh <name>", "Switch harness");
    help.insert("/clear, /c", "Clear chat history");
    help
}

pub fn get_command_completions(prefix: &str) -> Vec<String> {
    let commands = [
        "/help",
        "/h",
        "/?",
        "/skill",
        "/s",
        "/memory",
        "/mem",
        "/m",
        "/remember",
        "/r",
        "/switch-harness",
        "/switch",
        "/sh",
        "/clear",
        "/c",
    ];

    commands
        .iter()
        .filter(|cmd| cmd.starts_with(prefix))
        .map(|s| s.to_string())
        .collect()
}
