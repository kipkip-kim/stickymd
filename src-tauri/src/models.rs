use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoMeta {
    pub id: String,
    pub title: String,
    pub created: String,
    pub modified: String,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memo {
    pub meta: MemoMeta,
    pub content: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoListItem {
    pub id: String,
    pub title: String,
    pub modified: String,
    pub pinned: bool,
    pub preview: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoListResponse {
    pub items: Vec<MemoListItem>,
    pub total: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: 100.0,
            y: 100.0,
            width: 800.0,
            height: 600.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub current_dir: String,
    pub recent_dirs: Vec<String>,
    pub default_dir: String,
    pub auto_save_delay: u32,
    pub theme: ThemeMode,
    pub font_family: String,
    pub font_size: u32,
    pub editor_window_state: WindowState,
    #[serde(default)]
    pub open_stickies: Vec<OpenStickyInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenStickyInfo {
    pub memo_id: String,
    pub file_path: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for AppConfig {
    fn default() -> Self {
        let default_dir = dirs::document_dir()
            .unwrap_or_default()
            .join("StickyMemo")
            .to_string_lossy()
            .to_string();
        Self {
            current_dir: default_dir.clone(),
            recent_dirs: vec![],
            default_dir,
            auto_save_delay: 1000,
            theme: ThemeMode::System,
            font_family: "Pretendard".to_string(),
            font_size: 16,
            editor_window_state: WindowState {
                x: 100.0,
                y: 100.0,
                width: 900.0,
                height: 700.0,
            },
            open_stickies: vec![],
        }
    }
}
