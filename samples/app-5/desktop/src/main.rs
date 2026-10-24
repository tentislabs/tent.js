// The window of bots: it starts the app on this computer, if it is not running yet, and shows it.
//
// Where the app answers is `BOTS_AT`, `http://127.0.0.1:4805` where it is not set. What starts it is the
// line that `tent service <bundle> --data <folder> --port 4805 --line` prints, given in `BOTS_START` or kept
// in `start.txt` beside this program.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Theme, Url, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_AT: &str = "http://127.0.0.1:4805";
const WAIT: Duration = Duration::from_secs(90);

fn address() -> String {
    std::env::var("BOTS_AT").unwrap_or_else(|_| DEFAULT_AT.to_string())
}

/// Whether something listens at the host and port of the address.
fn answers(url: &Url) -> bool {
    let host = url.host_str().unwrap_or("127.0.0.1");
    let port = url.port_or_known_default().unwrap_or(80);
    match (host, port).to_socket_addrs() {
        Ok(mut found) => found.any(|one| TcpStream::connect_timeout(&one, Duration::from_millis(400)).is_ok()),
        Err(_) => false,
    }
}

/// The line that starts the app: from `BOTS_START`, or else from `start.txt` beside this program.
fn start_line() -> Option<String> {
    if let Ok(line) = std::env::var("BOTS_START") {
        if !line.trim().is_empty() {
            return Some(line);
        }
    }
    let beside: PathBuf = std::env::current_exe().ok()?.with_file_name("start.txt");
    let line = std::fs::read_to_string(beside).ok()?;
    let line = line.lines().find(|one| !one.trim().is_empty())?.to_string();
    Some(line)
}

/// The words of a line, as a shell reads them: split at spaces, with double quotes holding a word together.
fn words_of(line: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut word = String::new();
    let mut quoted = false;
    let mut started = false;
    for c in line.trim().chars() {
        match c {
            '"' => {
                quoted = !quoted;
                started = true;
            }
            ' ' | '\t' if !quoted => {
                if started {
                    words.push(std::mem::take(&mut word));
                    started = false;
                }
            }
            _ => {
                word.push(c);
                started = true;
            }
        }
    }
    if started {
        words.push(word);
    }
    words
}

/// Starts the app as a program of its own, which goes on when the window is closed.
fn start(line: &str) -> Result<(), String> {
    let words = words_of(line);
    let (program, rest) = words.split_first().ok_or("the start line is empty")?;
    let mut command = Command::new(program);
    command.args(rest).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window of its own, and not ended with the window.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        command.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    }
    command.spawn().map(|_| ()).map_err(|error| error.to_string())
}

fn say(window: &tauri::WebviewWindow, words: &str) {
    let text = words.replace('\\', "\\\\").replace('\'', "\\'");
    let _ = window.eval(format!("document.getElementById('words').textContent = '{text}'"));
}

/// Where the window opens, from `BOTS_WINDOW_AT` as `x,y`: a test opens it off the screen.
fn window_at() -> Option<(f64, f64)> {
    let at = std::env::var("BOTS_WINDOW_AT").ok()?;
    let (x, y) = at.split_once(',')?;
    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("bots")
                .inner_size(1280.0, 800.0)
                .min_inner_size(760.0, 560.0)
                .theme(Some(Theme::Dark))
                .background_color(tauri::window::Color(18, 18, 18, 255));
            if let Some((x, y)) = window_at() {
                builder = builder.position(x, y);
            }
            let window = builder.build()?;
            let at = address();
            thread::spawn(move || {
                let Ok(url) = Url::parse(&format!("{}/bots", at.trim_end_matches('/'))) else {
                    say(&window, "BOTS_AT is no address");
                    return;
                };
                if !answers(&url) {
                    match start_line() {
                        Some(line) => {
                            if let Err(error) = start(&line) {
                                say(&window, &format!("bots did not start: {error}"));
                                return;
                            }
                        }
                        None => {
                            say(&window, "Start bots with tent service, or write its line into start.txt beside this program");
                            return;
                        }
                    }
                }
                let began = Instant::now();
                while !answers(&url) {
                    if began.elapsed() > WAIT {
                        say(&window, "bots did not answer. Its log is in its data folder");
                        return;
                    }
                    thread::sleep(Duration::from_millis(250));
                }
                let _ = window.navigate(url);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the window of bots could not open");
}
