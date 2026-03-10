use crate::models::{Memo, MemoListItem, MemoListResponse, MemoMeta};
use crate::utils::frontmatter;
use chrono::Utc;
use glob::glob;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[tauri::command]
pub fn load_memos(dir: String, limit: usize, offset: usize) -> Result<MemoListResponse, String> {
    let dir_path = Path::new(&dir);
    if !dir_path.exists() {
        fs::create_dir_all(dir_path).map_err(|e| format!("Failed to create dir: {}", e))?;
    }

    let pattern = dir_path.join("*.md");
    let pattern_str = pattern.to_string_lossy().to_string();

    let mut items: Vec<MemoListItem> = Vec::new();

    for entry in glob(&pattern_str).map_err(|e| format!("Invalid glob: {}", e))? {
        let path = entry.map_err(|e| format!("Glob error: {}", e))?;
        let raw = fs::read_to_string(&path).unwrap_or_default();
        let (meta, content) = frontmatter::parse_with_file_info(&raw, &path)?;

        let preview: String = content
            .lines()
            .filter(|l| !l.trim().is_empty())
            .take(2)
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(120)
            .collect();

        items.push(MemoListItem {
            id: meta.id,
            title: meta.title,
            modified: meta.modified,
            pinned: meta.pinned,
            preview,
            file_path: path.to_string_lossy().to_string(),
        });
    }

    // Sort: pinned first, then by modified desc
    items.sort_by(|a, b| {
        b.pinned
            .cmp(&a.pinned)
            .then_with(|| b.modified.cmp(&a.modified))
    });

    let total = items.len();
    let has_more = offset + limit < total;
    let paged: Vec<MemoListItem> = items.into_iter().skip(offset).take(limit).collect();

    Ok(MemoListResponse {
        items: paged,
        total,
        has_more,
    })
}

#[tauri::command]
pub fn read_memo(file_path: String) -> Result<Memo, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))?;
    let (meta, content) = frontmatter::parse_with_file_info(&raw, &path)?;
    Ok(Memo {
        meta,
        content,
        file_path,
    })
}

#[tauri::command]
pub fn save_memo(
    dir: String,
    id: Option<String>,
    title: String,
    content: String,
    pinned: bool,
) -> Result<Memo, String> {
    let dir_path = Path::new(&dir);
    if !dir_path.exists() {
        fs::create_dir_all(dir_path).map_err(|e| format!("Failed to create dir: {}", e))?;
    }

    let now = Utc::now().to_rfc3339();
    let memo_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());

    // Try to find existing file by ID in frontmatter
    let existing_path = find_memo_file_by_id(dir_path, &memo_id);

    let (meta, file_path) = if let Some(existing) = existing_path {
        // Update existing
        let raw = fs::read_to_string(&existing).unwrap_or_default();
        let (mut old_meta, _) = frontmatter::parse(&raw)?;
        old_meta.title = title;
        old_meta.modified = now;
        old_meta.pinned = pinned;
        (old_meta, existing)
    } else {
        // New memo
        let safe_name = sanitize_filename(&title);
        let file_name = if safe_name.is_empty() {
            format!("{}.md", &memo_id[..8])
        } else {
            format!("{}.md", safe_name)
        };
        let file_path = dir_path.join(&file_name);

        let meta = MemoMeta {
            id: memo_id.clone(),
            title,
            created: now.clone(),
            modified: now,
            pinned,
        };
        (meta, file_path)
    };

    let output = frontmatter::serialize(&meta, &content);
    fs::write(&file_path, &output).map_err(|e| format!("Write error: {}", e))?;

    Ok(Memo {
        meta,
        content,
        file_path: file_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn delete_memo(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Delete error: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn search_memos(dir: String, query: String) -> Result<Vec<MemoListItem>, String> {
    let dir_path = Path::new(&dir);
    if !dir_path.exists() {
        return Ok(vec![]);
    }

    let pattern = dir_path.join("*.md");
    let pattern_str = pattern.to_string_lossy().to_string();
    let query_lower = query.to_lowercase();

    let mut results: Vec<MemoListItem> = Vec::new();

    for entry in glob(&pattern_str).map_err(|e| format!("Invalid glob: {}", e))? {
        let path = entry.map_err(|e| format!("Glob error: {}", e))?;
        let raw = fs::read_to_string(&path).unwrap_or_default();
        let (meta, content) = frontmatter::parse_with_file_info(&raw, &path)?;

        let title_match = meta.title.to_lowercase().contains(&query_lower);
        let content_match = content.to_lowercase().contains(&query_lower);

        if title_match || content_match {
            let preview: String = content
                .lines()
                .filter(|l| !l.trim().is_empty())
                .take(2)
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(120)
                .collect();

            results.push(MemoListItem {
                id: meta.id,
                title: meta.title,
                modified: meta.modified,
                pinned: meta.pinned,
                preview,
                file_path: path.to_string_lossy().to_string(),
            });
        }
    }

    results.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(results)
}

#[tauri::command]
pub fn open_file_and_switch_dir(file_path: String) -> Result<(String, Memo), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let parent_dir = path
        .parent()
        .ok_or("Cannot determine parent directory")?
        .to_string_lossy()
        .to_string();

    let raw = fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))?;
    let (meta, content) = frontmatter::parse_with_file_info(&raw, &path)?;

    let memo = Memo {
        meta,
        content,
        file_path,
    };

    Ok((parent_dir, memo))
}

fn find_memo_file_by_id(dir: &Path, id: &str) -> Option<PathBuf> {
    let pattern = dir.join("*.md");
    let pattern_str = pattern.to_string_lossy().to_string();

    if let Ok(entries) = glob(&pattern_str) {
        for entry in entries.flatten() {
            if let Ok(raw) = fs::read_to_string(&entry) {
                if let Ok((meta, _)) = frontmatter::parse(&raw) {
                    if meta.id == id {
                        return Some(entry);
                    }
                }
            }
        }
    }
    None
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .chars()
        .take(100)
        .collect()
}
