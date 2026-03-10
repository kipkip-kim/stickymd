use crate::models::WindowState;
use tauri::WebviewWindow;

#[tauri::command]
pub fn set_always_on_top(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| format!("Failed to set always on top: {}", e))
}

#[tauri::command]
pub fn set_window_state(
    window: WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {}", e))?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_window_state(window: WebviewWindow) -> Result<WindowState, String> {
    let pos = window
        .outer_position()
        .map_err(|e| format!("Failed to get position: {}", e))?;
    let size = window
        .inner_size()
        .map_err(|e| format!("Failed to get size: {}", e))?;
    Ok(WindowState {
        x: pos.x as f64,
        y: pos.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    })
}

#[tauri::command]
pub fn set_decorations(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_decorations(enabled)
        .map_err(|e| format!("Failed to set decorations: {}", e))
}
