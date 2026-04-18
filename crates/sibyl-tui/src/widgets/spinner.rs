use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpinnerState {
    Idle,
    Processing,
    #[allow(dead_code)]
    Streaming,
}

pub struct Spinner {
    state: SpinnerState,
    start_time: Option<Instant>,
    frame: usize,
}

impl Default for Spinner {
    fn default() -> Self {
        Self::new()
    }
}

impl Spinner {
    pub fn new() -> Self {
        Self {
            state: SpinnerState::Idle,
            start_time: None,
            frame: 0,
        }
    }

    pub fn start(&mut self, state: SpinnerState) {
        self.state = state;
        self.start_time = Some(Instant::now());
        self.frame = 0;
    }

    pub fn stop(&mut self) {
        self.state = SpinnerState::Idle;
        self.start_time = None;
        self.frame = 0;
    }

    pub fn is_active(&self) -> bool {
        self.state != SpinnerState::Idle
    }

    pub fn tick(&mut self) {
        if self.is_active() {
            self.frame = (self.frame + 1) % SPINNER_CHARS.len();
        }
    }

    #[allow(dead_code)]
    pub fn current_char(&self) -> char {
        if self.is_active() {
            SPINNER_CHARS[self.frame]
        } else {
            ' '
        }
    }

    pub fn current_str(&self) -> &'static str {
        if self.is_active() {
            SPINNER_STRS[self.frame]
        } else {
            " "
        }
    }

    pub fn elapsed(&self) -> Option<std::time::Duration> {
        self.start_time.map(|t| t.elapsed())
    }

    #[allow(dead_code)]
    pub fn elapsed_secs(&self) -> u64 {
        self.elapsed().map(|d| d.as_secs()).unwrap_or(0)
    }

    #[allow(dead_code)]
    pub fn format_status(&self) -> String {
        match self.state {
            SpinnerState::Idle => String::new(),
            SpinnerState::Processing => {
                format!("{} Processing...", self.current_str())
            }
            SpinnerState::Streaming => {
                let secs = self.elapsed_secs();
                if secs > 0 {
                    format!("{} Streaming ({}s)", self.current_str(), secs)
                } else {
                    format!("{} Streaming...", self.current_str())
                }
            }
        }
    }
}

const SPINNER_CHARS: &[char] = &['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_STRS: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

#[allow(dead_code)]
pub fn render_spinner(spinner: &Spinner) -> String {
    spinner.format_status()
}
