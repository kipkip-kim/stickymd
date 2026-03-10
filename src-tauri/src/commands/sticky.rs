use crate::models::OpenStickyInfo;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone)]
pub struct StickyWindowInfo {
    pub label: String,
    pub file_path: String,
}

pub struct StickyRegistry {
    pub windows: Mutex<HashMap<String, StickyWindowInfo>>,
}

impl StickyRegistry {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn pop_out_memo(
    app: AppHandle,
    memo_id: String,
    file_path: String,
    title: String,
) -> Result<(), String> {
    let registry = app.state::<StickyRegistry>();
    let mut windows = registry.windows.lock().map_err(|e| e.to_string())?;

    // If already open, just focus
    if let Some(info) = windows.get(&memo_id) {
        if let Some(win) = app.get_webview_window(&info.label) {
            win.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }
        // Window handle gone, remove stale entry
        windows.remove(&memo_id);
    }

    let short_id = if memo_id.len() >= 8 {
        &memo_id[..8]
    } else {
        &memo_id
    };
    let label = format!("sticky-{}", short_id);

    let encoded_id = urlencoding::encode(&memo_id);
    let encoded_path = urlencoding::encode(&file_path);
    let url_str = format!(
        "index.html?sticky=true&memoId={}&filePath={}",
        encoded_id, encoded_path
    );

    let win = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url_str.into()))
        .title(&title)
        .inner_size(320.0, 400.0)
        .min_inner_size(200.0, 150.0)
        .decorations(false)
        .always_on_top(true)
        .build()
        .map_err(|e| format!("Failed to create sticky window: {}", e))?;

    // Register close handler to auto-unregister
    let app_handle = app.clone();
    let memo_id_clone = memo_id.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let registry = app_handle.state::<StickyRegistry>();
            if let Ok(mut windows) = registry.windows.lock() {
                windows.remove(&memo_id_clone);
            }
            let _ = app_handle.emit("sticky-closed", &memo_id_clone);
        }
    });

    windows.insert(
        memo_id.clone(),
        StickyWindowInfo {
            label,
            file_path,
        },
    );

    // Must drop lock before emit to avoid potential deadlock
    drop(windows);

    app.emit("sticky-opened", &memo_id)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn create_new_sticky(app: AppHandle, dir: String) -> Result<(), String> {
    use crate::commands::memo::save_memo;

    let memo = save_memo(
        dir,
        None,
        "새 메모".to_string(),
        String::new(),
        false,
    )?;

    pop_out_memo(app, memo.meta.id, memo.file_path, memo.meta.title)
}

#[tauri::command]
pub fn close_sticky(app: AppHandle, memo_id: String) -> Result<(), String> {
    let registry = app.state::<StickyRegistry>();
    let mut windows = registry.windows.lock().map_err(|e| e.to_string())?;

    if let Some(info) = windows.remove(&memo_id) {
        if let Some(win) = app.get_webview_window(&info.label) {
            win.destroy().map_err(|e| e.to_string())?;
        }
    }

    drop(windows);

    app.emit("sticky-closed", &memo_id)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn focus_sticky(app: AppHandle, memo_id: String) -> Result<(), String> {
    let registry = app.state::<StickyRegistry>();
    let windows = registry.windows.lock().map_err(|e| e.to_string())?;

    if let Some(info) = windows.get(&memo_id) {
        if let Some(win) = app.get_webview_window(&info.label) {
            win.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    Err("Sticky window not found".to_string())
}

#[tauri::command]
pub fn get_open_stickies(app: AppHandle) -> Result<Vec<String>, String> {
    let registry = app.state::<StickyRegistry>();
    let windows = registry.windows.lock().map_err(|e| e.to_string())?;
    Ok(windows.keys().cloned().collect())
}

#[tauri::command]
pub fn unregister_sticky(app: AppHandle, memo_id: String) -> Result<(), String> {
    let registry = app.state::<StickyRegistry>();
    let mut windows = registry.windows.lock().map_err(|e| e.to_string())?;
    windows.remove(&memo_id);

    drop(windows);

    app.emit("sticky-closed", &memo_id)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn persist_open_stickies(app: AppHandle) -> Result<Vec<OpenStickyInfo>, String> {
    let registry = app.state::<StickyRegistry>();
    let windows = registry.windows.lock().map_err(|e| e.to_string())?;

    let mut result = Vec::new();

    for (memo_id, info) in windows.iter() {
        if let Some(win) = app.get_webview_window(&info.label) {
            let pos = win.outer_position().unwrap_or_default();
            let size = win.inner_size().unwrap_or_default();
            result.push(OpenStickyInfo {
                memo_id: memo_id.clone(),
                file_path: info.file_path.clone(),
                x: pos.x as f64,
                y: pos.y as f64,
                width: size.width as f64,
                height: size.height as f64,
            });
        }
    }

    Ok(result)
}
