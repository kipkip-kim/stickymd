mod commands;
mod models;
mod utils;

use commands::sticky::StickyRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(StickyRegistry::new())
        .invoke_handler(tauri::generate_handler![
            // memo commands
            commands::memo::load_memos,
            commands::memo::read_memo,
            commands::memo::save_memo,
            commands::memo::delete_memo,
            commands::memo::search_memos,
            commands::memo::open_file_and_switch_dir,
            // config commands
            commands::config::get_config,
            commands::config::set_config,
            commands::config::pick_directory,
            // window commands
            commands::window::set_always_on_top,
            commands::window::set_window_state,
            commands::window::get_window_state,
            commands::window::set_decorations,
            // sticky commands
            commands::sticky::pop_out_memo,
            commands::sticky::create_new_sticky,
            commands::sticky::close_sticky,
            commands::sticky::focus_sticky,
            commands::sticky::get_open_stickies,
            commands::sticky::unregister_sticky,
            commands::sticky::persist_open_stickies,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
