use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

use crate::app::AppMode;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandleResult {
    Continue,
    SwitchMode(AppMode),
    ToggleMemoryPanel,
    ScrollUp(usize),
    ScrollDown(usize),
    ScrollToBottom,
    SubmitInput,
    #[allow(dead_code)]
    ClearChat,
    ShowHelp,
    HideHelp,
    CancelSession,
    DoubleEsc,
}

pub fn handle_global_key(key: KeyEvent, current_mode: AppMode) -> HandleResult {
    match key.code {
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            HandleResult::CancelSession
        }
        KeyCode::Tab => HandleResult::ToggleMemoryPanel,
        KeyCode::Char('?')
            if key.modifiers.contains(KeyModifiers::NONE)
                && current_mode != AppMode::Chat
                && current_mode != AppMode::CommandPalette =>
        {
            HandleResult::ShowHelp
        }
        KeyCode::Esc => {
            if current_mode == AppMode::HelpOverlay || current_mode == AppMode::CommandPalette {
                HandleResult::SwitchMode(AppMode::Chat)
            } else if current_mode == AppMode::Chat {
                HandleResult::DoubleEsc
            } else {
                HandleResult::HideHelp
            }
        }
        KeyCode::Char(':') if key.modifiers.contains(KeyModifiers::NONE) => {
            HandleResult::SwitchMode(AppMode::CommandPalette)
        }
        _ => HandleResult::Continue,
    }
}

pub fn handle_chat_key(key: KeyEvent) -> HandleResult {
    match key.code {
        KeyCode::End => HandleResult::ScrollToBottom,
        KeyCode::Char('j') if key.modifiers.contains(KeyModifiers::ALT) => {
            HandleResult::ScrollDown(1)
        }
        KeyCode::Char('k') if key.modifiers.contains(KeyModifiers::ALT) => {
            HandleResult::ScrollUp(1)
        }
        KeyCode::Char('d') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            HandleResult::ScrollDown(10)
        }
        KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            HandleResult::ScrollUp(10)
        }
        KeyCode::Char('g') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            HandleResult::ScrollToBottom
        }
        KeyCode::Enter if key.modifiers.contains(KeyModifiers::NONE) => HandleResult::SubmitInput,
        _ => HandleResult::Continue,
    }
}

pub fn handle_memory_key(key: KeyEvent) -> HandleResult {
    match key.code {
        KeyCode::Char('j') if key.modifiers.contains(KeyModifiers::ALT) => {
            HandleResult::ScrollDown(1)
        }
        KeyCode::Char('k') if key.modifiers.contains(KeyModifiers::ALT) => {
            HandleResult::ScrollUp(1)
        }
        KeyCode::Tab | KeyCode::Esc => HandleResult::ToggleMemoryPanel,
        _ => HandleResult::Continue,
    }
}

pub fn should_handle_as_input(key: KeyEvent, mode: AppMode) -> bool {
    if mode == AppMode::CommandPalette {
        return true;
    }

    if key.modifiers.contains(KeyModifiers::CONTROL) {
        if let KeyCode::Char(c) = key.code {
            return matches!(c, 'a' | 'e' | 'w' | 'u');
        }
        return false;
    }

    matches!(
        key.code,
        KeyCode::Char(_)
            | KeyCode::Backspace
            | KeyCode::Delete
            | KeyCode::Left
            | KeyCode::Right
            | KeyCode::Home
            | KeyCode::End
            | KeyCode::Up
            | KeyCode::Down
    )
}
