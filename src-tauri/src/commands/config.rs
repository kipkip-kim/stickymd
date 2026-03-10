use crate::models::AppConfig;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

fn config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn get_config(app_handle: tauri::AppHandle) -> Result<AppConfig, String> {
    let path = config_path(&app_handle)?;

    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))?;
        let config: AppConfig =
            serde_json::from_str(&raw).map_err(|e| format!("Parse error: {}", e))?;
        Ok(config)
    } else {
        let config = AppConfig::default();
        // Ensure default dir exists
        let default_dir = std::path::Path::new(&config.default_dir);
        if !default_dir.exists() {
            let _ = fs::create_dir_all(default_dir);
        }
        // Save default config
        let json =
            serde_json::to_string_pretty(&config).map_err(|e| format!("Serialize error: {}", e))?;
        fs::write(&path, json).map_err(|e| format!("Write error: {}", e))?;
        Ok(config)
    }
}

#[tauri::command]
pub fn set_config(app_handle: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app_handle)?;
    let json =
        serde_json::to_string_pretty(&config).map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn pick_directory(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let result = app_handle
        .dialog()
        .file()
        .blocking_pick_folder();

    Ok(result.map(|p| p.to_string()))
}
