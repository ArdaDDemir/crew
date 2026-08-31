#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod last_project;
mod listen_url;

use last_project::{last_project_file, load_last_project, save_last_project};
use listen_url::parse_listen_url;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager};

const DESKTOP_INIT: &str = r#"
window.__CREW_DESKTOP__ = true;
"#;

struct Office {
    child: Mutex<Option<Child>>,
    cwd: Mutex<Option<PathBuf>>,
}

static STARTED: AtomicBool = AtomicBool::new(false);

fn log_line(msg: &str) {
    let Some(dir) = last_project_file().parent().map(Path::to_path_buf) else {
        return;
    };
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("desktop.log"))
    {
        let _ = writeln!(f, "{msg}");
    }
}

fn alert(title: &str, description: &str) {
    rfd::MessageDialog::new()
        .set_title(title)
        .set_level(rfd::MessageLevel::Error)
        .set_description(description)
        .show();
}

fn alert_engine(detail: &str) {
    let extra = detail.trim();
    let description = if extra.is_empty() {
        "Could not start the office engine.".to_string()
    } else {
        let short: String = extra.chars().take(400).collect();
        format!("Could not start the office engine.\n\n{short}")
    };
    alert("Crew", &description);
}

fn pick_project() -> Option<PathBuf> {
    rfd::FileDialog::new().set_title("Open project").pick_folder()
}

fn find_bun() -> Result<PathBuf, String> {
    if let Ok(home) = std::env::var("BUN_INSTALL") {
        let p = PathBuf::from(home).join("bin").join("bun.exe");
        if p.is_file() {
            return Ok(p);
        }
    }
    if let Ok(user) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(user).join(".bun").join("bin").join("bun.exe");
        if p.is_file() {
            return Ok(p);
        }
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(';') {
            let p = PathBuf::from(dir).join("bun.exe");
            if p.is_file() {
                return Ok(p);
            }
        }
    }
    Err("bun not found".into())
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn sidecar_exe() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no exe dir")?;
    for name in ["crew-server.exe", "crew-server-x86_64-pc-windows-msvc.exe"] {
        let p = dir.join(name);
        if p.is_file() {
            return Ok(p);
        }
    }
    Err("crew-server.exe not found next to Crew.exe".into())
}

fn spawn_office(cwd: &Path) -> Result<(Child, String), String> {
    let mut cmd = if cfg!(debug_assertions) {
        let bun = find_bun()?;
        let script = repo_root().join("apps/web/src/server.ts");
        if !script.is_file() {
            return Err(format!("server missing: {}", script.display()));
        }
        let mut c = Command::new(bun);
        c.arg(script).arg("--cwd").arg(cwd).arg("--hostname").arg("127.0.0.1");
        c
    } else {
        let exe = sidecar_exe()?;
        let mut c = Command::new(&exe);
        c.arg("--cwd").arg(cwd).arg("--hostname").arg("127.0.0.1");
        if let Some(dir) = exe.parent() {
            let public = dir.join("public");
            if public.is_dir() {
                c.arg("--public").arg(public);
            }
        }
        c
    };
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .current_dir(cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let url = wait_for_url(&mut child)?;
    Ok((child, url))
}

fn wait_for_url(child: &mut Child) -> Result<String, String> {
    let stdout = child.stdout.take().ok_or_else(|| "no stdout".to_string())?;
    let err_buf = Arc::new(Mutex::new(String::new()));
    if let Some(stderr) = child.stderr.take() {
        let buf = err_buf.clone();
        std::thread::spawn(move || {
            let mut s = String::new();
            let _ = BufReader::new(stderr).read_to_string(&mut s);
            if let Ok(mut g) = buf.lock() {
                *g = s;
            }
        });
    }
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if let Some(url) = parse_listen_url(&line) {
                let _ = tx.send(Ok(url));
                return;
            }
        }
        let _ = tx.send(Err("no listen url".to_string()));
    });
    match rx.recv_timeout(Duration::from_secs(20)) {
        Ok(Ok(url)) => Ok(url),
        Ok(Err(why)) => Err(finish_err(why, &err_buf, child)),
        Err(_) => {
            let _ = child.kill();
            Err(finish_err("timed out waiting for the office".into(), &err_buf, child))
        }
    }
}

fn finish_err(why: String, err_buf: &Arc<Mutex<String>>, child: &mut Child) -> String {
    let _ = child.try_wait();
    let stderr = err_buf
        .lock()
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    match stderr {
        Some(s) => format!("{why}\n{s}"),
        None => why,
    }
}

fn kill_office(office: &Office) {
    if let Ok(mut g) = office.child.lock() {
        if let Some(mut child) = g.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn load_window(app: &AppHandle, url: &str) -> Result<(), String> {
    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_decorations(false);
        win.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(parsed))
        .title("Crew")
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .decorations(false)
        .shadow(true)
        .initialization_script(DESKTOP_INIT)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn start_into(app: &AppHandle, cwd: &Path) -> Result<(), String> {
    let office = app.state::<Office>();
    kill_office(&office);
    let (child, url) = spawn_office(cwd)?;
    *office.child.lock().map_err(|e| e.to_string())? = Some(child);
    *office.cwd.lock().map_err(|e| e.to_string())? = Some(cwd.to_path_buf());
    log_line(&format!("listening {url}"));
    load_window(app, &url)?;
    save_last_project(cwd).map_err(|e| e.to_string())?;
    log_line("window up");
    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn install_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Crew", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open projectâ€¦", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &open, &quit])?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Crew")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "open" => open_or_switch(app, false),
            "quit" => {
                let office = app.state::<Office>();
                kill_office(&office);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

fn open_or_switch(app: &AppHandle, first: bool) {
    let cwd = if first {
        load_last_project().or_else(pick_project)
    } else {
        pick_project()
    };
    let Some(cwd) = cwd else {
        if first {
            app.exit(0);
        }
        return;
    };
    if !cwd.is_dir() {
        alert("Crew", "That path is not a folder.");
        if first {
            open_or_switch(app, true);
        }
        return;
    }
    log_line(&format!("open first={first} cwd={}", cwd.display()));
    if let Err(err) = start_into(app, &cwd) {
        log_line(&format!("start failed: {err}"));
        alert_engine(&err);
        if first {
            app.exit(1);
        }
    }
}

fn webview2_missing(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    e.contains("webview2") || e.contains("webview runtime")
}

fn main() {
    log_line("main:start");
    let built = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .manage(Office {
            child: Mutex::new(None),
            cwd: Mutex::new(None),
        })
        .setup(|app| {
            log_line("setup:start");
            let handle = app.handle().clone();
            let _ = app.listen("crew-open-project", move |_| {
                open_or_switch(&handle, false);
            });
            if let Err(err) = install_tray(app.handle()) {
                log_line(&format!("tray failed: {err}"));
            }
            log_line("setup:done");
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
            tauri::WindowEvent::Destroyed => {
                log_line(&format!("destroyed {}", window.label()));
                if window.label() != "main" {
                    return;
                }
                let app = window.app_handle();
                let office = app.state::<Office>();
                kill_office(&office);
                app.exit(0);
            }
            _ => {}
        })
        .build(tauri::generate_context!());

    log_line("built ok");
    match built {
        Err(err) => {
            let msg = err.to_string();
            log_line(&format!("build failed: {msg}"));
            if webview2_missing(&msg) {
                alert("Crew", "Crew needs Microsoft Edge WebView2 Runtime.");
            } else {
                alert_engine(&msg);
            }
            std::process::exit(1);
        }
        Ok(app) => {
            app.run(|app, event| {
                if matches!(event, tauri::RunEvent::Ready) {
                    if STARTED.swap(true, Ordering::SeqCst) {
                        return;
                    }
                    log_line("ready");
                    open_or_switch(app, true);
                }
            });
        }
    }
}
