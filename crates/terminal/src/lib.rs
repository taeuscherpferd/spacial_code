use anyhow::{Context, Result};
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
#[cfg(windows)]
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TerminalEvent {
    Output(String),
    Exited(Option<u32>),
    Failed(String),
}

pub struct TerminalSession {
    master: Option<Box<dyn MasterPty + Send>>,
    writer: Option<Arc<Mutex<Box<dyn Write + Send>>>>,
    killer: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
    stopped: bool,
}

impl TerminalSession {
    pub fn spawn(
        command: &str,
        args: &[String],
        cwd: &Path,
        cols: u16,
        rows: u16,
    ) -> Result<(Self, mpsc::UnboundedReceiver<TerminalEvent>)> {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("could not create a pseudo-terminal")?;
        let mut builder = build_command(command, args);
        if let Some(path) = std::env::var_os("PATH") {
            builder.env("PATH", path);
        }
        builder.cwd(command_cwd(cwd));
        let mut child = pair
            .slave
            .spawn_command(builder)
            .with_context(|| format!("could not start {command}"))?;
        let killer = Arc::new(Mutex::new(child.clone_killer()));
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .context("could not attach to terminal output")?;
        let writer = Arc::new(Mutex::new(
            pair.master
                .take_writer()
                .context("could not attach to terminal input")?,
        ));
        let (events, receiver) = mpsc::unbounded_channel();
        let output_events = events.clone();
        let response_writer = Arc::clone(&writer);
        std::thread::spawn(move || {
            let mut buffer = [0_u8; 8192];
            let mut pending_query = String::new();
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => {
                        let output = String::from_utf8_lossy(&buffer[..read]).to_string();
                        let response_count =
                            cursor_position_query_count(&mut pending_query, &output);
                        if response_count > 0 {
                            let mut input = response_writer
                                .lock()
                                .expect("terminal writer lock poisoned");
                            for _ in 0..response_count {
                                let _ = input.write_all(b"\x1b[1;1R");
                            }
                            let _ = input.flush();
                        }
                        if output_events.send(TerminalEvent::Output(output)).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
        std::thread::spawn(move || {
            let status = child.wait();
            let event = match status {
                Ok(status) => TerminalEvent::Exited(Some(status.exit_code())),
                Err(error) => TerminalEvent::Failed(error.to_string()),
            };
            let _ = events.send(event);
        });

        Ok((
            Self {
                master: Some(pair.master),
                writer: Some(writer),
                killer,
                stopped: false,
            },
            receiver,
        ))
    }

    pub fn write(&self, data: &str) -> Result<()> {
        let mut writer = self
            .writer
            .as_ref()
            .context("terminal session is stopped")?
            .lock()
            .expect("terminal writer lock poisoned");
        writer
            .write_all(data.as_bytes())
            .context("could not write terminal input")?;
        writer.flush().context("could not flush terminal input")
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.master
            .as_ref()
            .context("terminal session is stopped")?
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("could not resize terminal")
    }

    pub fn stop(&mut self) -> Result<()> {
        if self.stopped {
            return Ok(());
        }
        self.stopped = true;
        #[cfg(windows)]
        {
            let killer = Arc::clone(&self.killer);
            std::thread::spawn(move || {
                let _ = killer
                    .lock()
                    .expect("terminal process lock poisoned")
                    .kill();
            });
            self.writer.take();
            self.master.take();
            Ok(())
        }
        #[cfg(not(windows))]
        {
            self.killer
                .lock()
                .expect("terminal process lock poisoned")
                .kill()
                .context("could not stop terminal process")
        }
    }

    pub fn disarm_killer(&mut self) {
        self.stopped = true;
    }
}

#[cfg(not(windows))]
fn command_cwd(cwd: &Path) -> PathBuf {
    cwd.to_path_buf()
}

#[cfg(windows)]
fn command_cwd(cwd: &Path) -> PathBuf {
    let value = cwd.as_os_str().to_string_lossy();
    if let Some(path) = value.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{path}"));
    }
    if let Some(path) = value.strip_prefix(r"\\?\") {
        return PathBuf::from(path);
    }
    cwd.to_path_buf()
}

fn cursor_position_query_count(pending: &mut String, chunk: &str) -> usize {
    const QUERY: &str = "\x1b[6n";
    pending.push_str(chunk);
    let count = pending.matches(QUERY).count();
    let suffix_length = (1..QUERY.len())
        .rev()
        .find(|length| pending.ends_with(&QUERY[..*length]))
        .unwrap_or(0);
    let suffix = pending[pending.len() - suffix_length..].to_owned();
    pending.clear();
    pending.push_str(&suffix);
    count
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        if !self.stopped {
            let _ = self.stop();
        }
    }
}

#[cfg(not(windows))]
fn build_command(command: &str, args: &[String]) -> CommandBuilder {
    let mut builder = CommandBuilder::new(command);
    builder.args(args);
    builder
}

#[cfg(windows)]
fn build_command(command: &str, args: &[String]) -> CommandBuilder {
    let executable = resolve_windows_executable(command);
    let is_script = executable
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension.to_ascii_lowercase().as_str(), "cmd" | "bat"));
    if is_script {
        if let Some(script) = resolve_node_batch_script(&executable) {
            let mut builder = CommandBuilder::new(resolve_windows_executable("node"));
            builder.arg(script);
            builder.args(args);
            return builder;
        }
        let mut builder = CommandBuilder::new("powershell.exe");
        builder.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
        ]);
        builder.arg(powershell_script(&executable, args));
        builder
    } else {
        let mut builder = CommandBuilder::new(executable);
        builder.args(args);
        builder
    }
}

#[cfg(windows)]
fn resolve_node_batch_script(executable: &Path) -> Option<PathBuf> {
    let parent = executable.parent()?;
    let parent_prefix = format!("{}\\", parent.display());
    let contents = fs::read_to_string(executable).ok()?;
    contents.split('"').find_map(|segment| {
        let expanded = segment
            .replace("%~dp0", &parent_prefix)
            .replace("%dp0%", &parent_prefix);
        let candidate = PathBuf::from(expanded);
        let is_javascript = candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "js" | "cjs" | "mjs"
                )
            });
        (is_javascript && candidate.is_file()).then_some(candidate)
    })
}

#[cfg(windows)]
fn powershell_script(executable: &Path, args: &[String]) -> String {
    let command = std::iter::once(executable.to_string_lossy().to_string())
        .chain(args.iter().cloned())
        .map(|part| format!("'{}'", part.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(" ");
    format!("& {command}; exit $LASTEXITCODE")
}

#[cfg(windows)]
fn resolve_windows_executable(command: &str) -> PathBuf {
    let requested = Path::new(command);
    if requested.components().count() > 1 && requested.exists() {
        return requested.to_path_buf();
    }
    let extensions = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_owned());
    if let Some(paths) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&paths) {
            let direct = directory.join(requested);
            if direct.is_file() {
                return direct;
            }
            for extension in extensions.split(';') {
                let candidate = directory
                    .join(requested)
                    .with_extension(extension.trim_start_matches('.'));
                if candidate.is_file() {
                    return candidate;
                }
            }
        }
    }
    requested.to_path_buf()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn runs_windows_scripts_through_powershell() {
        let builder = build_command("missing.cmd", &["run".to_owned(), "my script".to_owned()]);
        assert_eq!(builder.get_argv()[0], "powershell.exe");
        assert!(
            builder
                .get_argv()
                .last()
                .is_some_and(|script| script.to_string_lossy().contains("'my script'"))
        );
    }

    #[test]
    fn resolves_node_script_from_batch_wrapper() {
        let directory =
            std::env::temp_dir().join(format!("spatial-code-batch-wrapper-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("test directory");
        let script = directory.join("runner.mjs");
        let wrapper = directory.join("runner.cmd");
        fs::write(&script, "").expect("node script");
        fs::write(&wrapper, "\"%~dp0node.exe\" \"%~dp0runner.mjs\" %*").expect("batch wrapper");
        assert_eq!(resolve_node_batch_script(&wrapper), Some(script.clone()));
        let _ = fs::remove_file(wrapper);
        let _ = fs::remove_file(script);
        let _ = fs::remove_dir(directory);
    }

    #[test]
    fn responds_to_cursor_queries_across_output_chunks() {
        let mut pending = String::new();
        assert_eq!(cursor_position_query_count(&mut pending, "ready\x1b["), 0);
        assert_eq!(
            cursor_position_query_count(&mut pending, "6nnext\x1b[6n"),
            2
        );
        assert!(pending.is_empty());
    }

    #[test]
    fn normalizes_verbatim_working_directories_for_child_processes() {
        assert_eq!(
            command_cwd(Path::new(r"\\?\D:\workspace")),
            PathBuf::from(r"D:\workspace")
        );
        assert_eq!(
            command_cwd(Path::new(r"\\?\UNC\server\workspace")),
            PathBuf::from(r"\\server\workspace")
        );
    }
}
