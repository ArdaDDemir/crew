use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
struct LastProject {
    cwd: String,
}

pub fn last_project_file() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("Crew").join("last-project.json")
}

pub fn load_last_project() -> Option<PathBuf> {
    load_last_project_from(&last_project_file())
}

pub fn save_last_project(cwd: &Path) -> std::io::Result<()> {
    save_last_project_to(&last_project_file(), cwd)
}

pub fn load_last_project_from(file: &Path) -> Option<PathBuf> {
    let raw = fs::read_to_string(file).ok()?;
    let raw = raw.strip_prefix('\u{feff}').unwrap_or(raw.as_str());
    let parsed: LastProject = serde_json::from_str(raw).ok()?;
    let cwd = PathBuf::from(parsed.cwd.trim());
    if cwd.is_dir() {
        Some(cwd)
    } else {
        None
    }
}

pub fn save_last_project_to(file: &Path, cwd: &Path) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir)?;
    }
    let body = LastProject {
        cwd: cwd.to_string_lossy().into_owned(),
    };
    fs::write(file, format!("{}\n", serde_json::to_string_pretty(&body)?))
}

#[cfg(test)]
mod tests {
    use super::{load_last_project_from, save_last_project_to};
    use std::fs;

    #[test]
    fn missing_or_invalid_is_none() {
        let dir = std::env::temp_dir().join(format!("crew-last-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("last-project.json");
        let _ = fs::remove_file(&file);
        assert!(load_last_project_from(&file).is_none());
        fs::write(&file, "{}\n").unwrap();
        assert!(load_last_project_from(&file).is_none());
        fs::write(&file, "\u{feff}{\"cwd\":\"not-a-dir\"}\n").unwrap();
        assert!(load_last_project_from(&file).is_none());
        fs::write(&file, "{\"cwd\":\"C:\\\\definitely-not-a-crew-folder-xyz\"}\n").unwrap();
        assert!(load_last_project_from(&file).is_none());
    }

    #[test]
    fn roundtrip_existing_dir() {
        let dir = std::env::temp_dir().join(format!("crew-last-ok-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("last-project.json");
        save_last_project_to(&file, &dir).unwrap();
        assert_eq!(load_last_project_from(&file).as_deref(), Some(dir.as_path()));
        let body = fs::read_to_string(&file).unwrap();
        fs::write(&file, format!("\u{feff}{body}")).unwrap();
        assert_eq!(load_last_project_from(&file).as_deref(), Some(dir.as_path()));
    }
}
