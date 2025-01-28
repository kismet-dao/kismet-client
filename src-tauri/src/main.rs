// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn close_app(window: tauri::Window) {
    println!("Closing application...");
    window.close().expect("Failed to close window");
}

fn main() {
    env_logger::init(); // Initialize the logger
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![close_app]) // Register the command
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}