pub mod client;
pub mod websocket;
pub mod error;

pub use client::OpenCodeClient;
pub use error::{Error, Result};