use crate::error::Result;
use pulldown_cmark::{Event, HeadingLevel, Parser, Tag, TagEnd};

pub fn extract_heading(content: &str, level: usize) -> Result<String> {
    let parser = Parser::new(content);
    let mut in_heading = false;
    let mut heading_text = String::new();
    let target_level = match level {
        1 => HeadingLevel::H1,
        2 => HeadingLevel::H2,
        3 => HeadingLevel::H3,
        4 => HeadingLevel::H4,
        5 => HeadingLevel::H5,
        6 => HeadingLevel::H6,
        _ => HeadingLevel::H1,
    };

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                in_heading = level == target_level;
            }
            Event::End(TagEnd::Heading(_)) => {
                if in_heading && !heading_text.is_empty() {
                    return Ok(heading_text.trim().to_string());
                }
                in_heading = false;
                heading_text.clear();
            }
            Event::Text(text) if in_heading => {
                heading_text.push_str(&text);
            }
            _ => {}
        }
    }

    if !heading_text.is_empty() {
        Ok(heading_text.trim().to_string())
    } else {
        Err(crate::error::Error::ParseError("No heading found".into()))
    }
}

pub fn extract_section(content: &str, section_name: &str) -> Result<String> {
    let parser = Parser::new(content);
    let mut in_section = false;
    let mut section_content = String::new();
    let mut section_level: Option<HeadingLevel> = None;

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                if in_section && Some(level) <= section_level {
                    return Ok(section_content.trim().to_string());
                }
                in_section = false;
            }
            Event::End(TagEnd::Heading(_)) => {}
            Event::Text(text) => {
                let text_str = text.to_string();
                if text_str == section_name || text_str == section_name.trim_start_matches("## ") {
                    in_section = true;
                    section_level = Some(HeadingLevel::H2);
                } else if in_section {
                    section_content.push_str(&text_str);
                    section_content.push('\n');
                }
            }
            Event::Code(text) if in_section => {
                section_content.push('`');
                section_content.push_str(&text);
                section_content.push('`');
            }
            Event::SoftBreak | Event::HardBreak if in_section => {
                section_content.push('\n');
            }
            _ => {}
        }
    }

    if !section_content.is_empty() {
        Ok(section_content.trim().to_string())
    } else {
        Ok(String::new())
    }
}

pub fn parse_tool_list(content: &str) -> Vec<String> {
    content
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.starts_with('-') || line.starts_with('*') {
                Some(
                    line.trim_start_matches('-')
                        .trim_start_matches('*')
                        .trim()
                        .to_string(),
                )
            } else {
                None
            }
        })
        .collect()
}

pub fn extract_name_from_heading(heading: &str) -> String {
    heading
        .trim_start_matches("Skill:")
        .trim_start_matches("skill:")
        .trim()
        .to_string()
}
