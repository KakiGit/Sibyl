use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use ratatui::{
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
};
use syntect::highlighting::ThemeSet;
use syntect::parsing::SyntaxSet;

use crate::theme::*;

#[allow(dead_code)]
pub struct MarkdownRenderer {
    syntax_set: SyntaxSet,
    theme_set: ThemeSet,
}

impl MarkdownRenderer {
    #[allow(dead_code)]
    pub fn new() -> Self {
        let syntax_set = SyntaxSet::load_defaults_newlines();
        let theme_set = ThemeSet::load_defaults();

        Self {
            syntax_set,
            theme_set,
        }
    }

    pub fn render(&self, markdown: &str) -> Text<'static> {
        let mut lines: Vec<Line<'static>> = Vec::new();
        let mut current_spans: Vec<Span<'static>> = Vec::new();
        let mut in_code_block = false;
        let mut code_lang: Option<String> = None;
        let mut code_content: String = String::new();
        let mut list_depth: usize = 0;
        let mut current_style: Style = default();

        let parser = Parser::new(markdown);

        for event in parser {
            match event {
                Event::Start(Tag::Heading { level, .. }) => {
                    current_style = match level {
                        pulldown_cmark::HeadingLevel::H1 => header(),
                        pulldown_cmark::HeadingLevel::H2 => {
                            header().add_modifier(Modifier::UNDERLINED)
                        }
                        _ => accent(),
                    };
                }
                Event::End(TagEnd::Heading(_)) => {
                    if !current_spans.is_empty() {
                        lines.push(Line::from(std::mem::take(&mut current_spans)));
                    }
                    current_style = default();
                }
                Event::Start(Tag::Paragraph) => {
                    current_style = default();
                }
                Event::End(TagEnd::Paragraph) => {
                    if !current_spans.is_empty() {
                        lines.push(Line::from(std::mem::take(&mut current_spans)));
                    }
                    lines.push(Line::from(""));
                }
                Event::Start(Tag::CodeBlock(kind)) => {
                    in_code_block = true;
                    code_lang = match kind {
                        pulldown_cmark::CodeBlockKind::Fenced(lang) => Some(lang.to_string()),
                        _ => None,
                    };
                    code_content.clear();
                }
                Event::End(TagEnd::CodeBlock) => {
                    in_code_block = false;
                    let highlighted = self.highlight_code(&code_content, code_lang.as_deref());
                    for hl_line in highlighted.lines {
                        let mut combined = vec![Span::styled("  ", code_block())];
                        combined.extend(hl_line.spans);
                        lines.push(Line::from(combined));
                    }
                    lines.push(Line::from(""));
                    code_lang = None;
                }
                Event::Start(Tag::List(_)) => {
                    list_depth += 1;
                }
                Event::End(TagEnd::List(_)) => {
                    list_depth = list_depth.saturating_sub(1);
                }
                Event::Start(Tag::Item) => {
                    let indent = "  ".repeat(list_depth.saturating_sub(1));
                    current_spans.push(Span::raw(format!("{}• ", indent)));
                }
                Event::End(TagEnd::Item) => {
                    if !current_spans.is_empty() {
                        lines.push(Line::from(std::mem::take(&mut current_spans)));
                    }
                }
                Event::Start(Tag::Strong) => {
                    current_style = current_style.add_modifier(Modifier::BOLD);
                }
                Event::End(TagEnd::Strong) => {
                    current_style = current_style.remove_modifier(Modifier::BOLD);
                }
                Event::Start(Tag::Emphasis) => {
                    current_style = current_style.add_modifier(Modifier::ITALIC);
                }
                Event::End(TagEnd::Emphasis) => {
                    current_style = current_style.remove_modifier(Modifier::ITALIC);
                }
                Event::Start(Tag::Strikethrough) => {
                    current_style = current_style.add_modifier(Modifier::CROSSED_OUT);
                }
                Event::End(TagEnd::Strikethrough) => {
                    current_style = current_style.remove_modifier(Modifier::CROSSED_OUT);
                }
                Event::Code(code) => {
                    current_spans.push(Span::styled(
                        format!("`{}`", code),
                        code_block().add_modifier(Modifier::BOLD),
                    ));
                }
                Event::Text(text) => {
                    if in_code_block {
                        code_content.push_str(&text);
                    } else {
                        current_spans.push(Span::styled(text.to_string(), current_style));
                    }
                }
                Event::SoftBreak | Event::HardBreak => {
                    if !current_spans.is_empty() {
                        lines.push(Line::from(std::mem::take(&mut current_spans)));
                    }
                }
                Event::Start(Tag::Link { dest_url, .. }) => {
                    current_spans.push(Span::styled(
                        dest_url.to_string(),
                        accent().add_modifier(Modifier::UNDERLINED),
                    ));
                }
                Event::End(TagEnd::Link) => {}
                _ => {}
            }
        }

        if !current_spans.is_empty() {
            lines.push(Line::from(current_spans));
        }

        Text::from(lines)
    }

    #[allow(dead_code)]
    fn highlight_code(&self, code: &str, lang: Option<&str>) -> Text<'static> {
        let syntax = lang
            .and_then(|l| self.syntax_set.find_syntax_by_token(l))
            .unwrap_or_else(|| self.syntax_set.find_syntax_plain_text());

        let theme = self
            .theme_set
            .themes
            .get("base16-mocha.dark")
            .unwrap_or(&self.theme_set.themes["base16-ocean.dark"]);

        let mut h = syntect::easy::HighlightLines::new(syntax, theme);
        let mut lines: Vec<Line<'static>> = Vec::new();

        for line in code.lines() {
            let spans: Vec<Span<'static>> = h
                .highlight_line(line, &self.syntax_set)
                .unwrap_or_default()
                .into_iter()
                .map(|(style, text)| {
                    Span::styled(
                        text.to_string(),
                        Style::default().fg(Color::Rgb(
                            style.foreground.r,
                            style.foreground.g,
                            style.foreground.b,
                        )),
                    )
                })
                .collect();
            lines.push(Line::from(spans));
        }

        Text::from(lines)
    }
}

impl Default for MarkdownRenderer {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
pub fn render_markdown_inline(text: &str) -> Text<'static> {
    let renderer = MarkdownRenderer::new();
    renderer.render(text)
}
