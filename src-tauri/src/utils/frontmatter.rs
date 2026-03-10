use crate::models::MemoMeta;
use chrono::Utc;
use std::fs;
use std::path::Path;
use uuid::Uuid;

pub fn parse(raw: &str) -> Result<(MemoMeta, String), String> {
    if raw.starts_with("---\n") || raw.starts_with("---\r\n") {
        let after_first = if raw.starts_with("---\r\n") {
            &raw[5..]
        } else {
            &raw[4..]
        };
        if let Some(end_idx) = after_first.find("\n---") {
            let yaml_str = &after_first[..end_idx];
            let rest_start = end_idx + 4; // skip \n---
            let body = after_first[rest_start..]
                .trim_start_matches('\r')
                .trim_start_matches('\n');

            let meta: MemoMeta = serde_yaml::from_str(yaml_str)
                .map_err(|e| format!("Failed to parse frontmatter: {}", e))?;
            return Ok((meta, body.to_string()));
        }
    }

    // No frontmatter — generate meta from content
    let title = extract_title_from_content(raw);
    let now = Utc::now().to_rfc3339();
    let meta = MemoMeta {
        id: Uuid::new_v4().to_string(),
        title,
        created: now.clone(),
        modified: now,
        pinned: false,
    };
    Ok((meta, raw.to_string()))
}

pub fn parse_with_file_info(raw: &str, file_path: &Path) -> Result<(MemoMeta, String), String> {
    if raw.starts_with("---\n") || raw.starts_with("---\r\n") {
        return parse(raw);
    }

    // Use file metadata for timestamps
    let title = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let (created, modified) = if let Ok(metadata) = fs::metadata(file_path) {
        let created = metadata
            .created()
            .ok()
            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        let modified = metadata
            .modified()
            .ok()
            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        (created, modified)
    } else {
        let now = Utc::now().to_rfc3339();
        (now.clone(), now)
    };

    let meta = MemoMeta {
        id: Uuid::new_v4().to_string(),
        title,
        created,
        modified,
        pinned: false,
    };
    Ok((meta, raw.to_string()))
}

pub fn serialize(meta: &MemoMeta, content: &str) -> String {
    let yaml = serde_yaml::to_string(meta).unwrap_or_default();
    format!("---\n{}---\n{}", yaml, content)
}

fn extract_title_from_content(content: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Strip leading markdown heading markers
        let title = trimmed.trim_start_matches('#').trim();
        if !title.is_empty() {
            return title.chars().take(100).collect();
        }
    }
    "Untitled".to_string()
}
