use anyhow::{Context, Result, bail};
use serde::Deserialize;
use spatial_code_core::protocol::RunConfiguration;
use spatial_code_terminal::{TerminalEvent, TerminalSession};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tokio::sync::mpsc;

#[derive(Deserialize)]
#[serde(untagged)]
enum ConfigurationFile {
    One(RunConfiguration),
    Many(Vec<RunConfiguration>),
}

pub struct ProcessManager {
    workspace: PathBuf,
    configurations: Vec<RunConfiguration>,
    session: Option<RunningSession>,
    next_session_id: u64,
}

struct RunningSession {
    id: u64,
    terminal: TerminalSession,
}

impl ProcessManager {
    pub fn open(workspace: impl AsRef<Path>) -> Result<Self> {
        let workspace = workspace.as_ref().canonicalize()?;
        let configurations = load_configurations(&workspace)?;
        Ok(Self {
            workspace,
            configurations,
            session: None,
            next_session_id: 1,
        })
    }

    pub fn configurations(&self) -> &[RunConfiguration] {
        &self.configurations
    }

    pub fn is_running(&self) -> bool {
        self.session.is_some()
    }

    pub fn start(
        &mut self,
        configuration_name: &str,
    ) -> Result<(u64, mpsc::UnboundedReceiver<TerminalEvent>)> {
        if self.session.is_some() {
            bail!("a process is already running");
        }
        let configuration = self
            .configurations
            .iter()
            .find(|item| item.name == configuration_name)
            .with_context(|| format!("unknown run configuration: {configuration_name}"))?;
        let cwd = resolve_cwd(&self.workspace, &configuration.cwd)?;
        let (session, events) =
            TerminalSession::spawn(&configuration.command, &configuration.args, &cwd, 100, 30)?;
        let session_id = self.next_session_id;
        self.next_session_id += 1;
        self.session = Some(RunningSession {
            id: session_id,
            terminal: session,
        });
        Ok((session_id, events))
    }

    pub fn input(&self, data: &str) -> Result<()> {
        self.session
            .as_ref()
            .context("no process is running")?
            .terminal
            .write(data)
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.session
            .as_ref()
            .context("no process is running")?
            .terminal
            .resize(cols, rows)
    }

    pub fn stop(&mut self) -> Result<()> {
        if let Some(mut session) = self.session.take() {
            session.terminal.stop()?;
        }
        Ok(())
    }

    pub fn mark_exited(&mut self, session_id: u64) -> bool {
        if self
            .session
            .as_ref()
            .is_some_and(|session| session.id == session_id)
        {
            if let Some(mut session) = self.session.take() {
                session.terminal.disarm_killer();
            }
            true
        } else {
            false
        }
    }
}

fn load_configurations(workspace: &Path) -> Result<Vec<RunConfiguration>> {
    let config_path = workspace.join(".spatial-code").join("run.json");
    if config_path.exists() {
        let json = fs::read_to_string(&config_path)
            .with_context(|| format!("could not read {}", config_path.display()))?;
        let configuration_file = serde_json::from_str::<ConfigurationFile>(&json)
            .with_context(|| format!("invalid run configuration: {}", config_path.display()))?;
        let configurations = match configuration_file {
            ConfigurationFile::One(configuration) => vec![configuration],
            ConfigurationFile::Many(configurations) => configurations,
        };
        if configurations.is_empty() {
            bail!("at least one run configuration is required");
        }
        return Ok(configurations);
    }

    let (command, args) = if workspace.join("pnpm-lock.yaml").exists() {
        ("pnpm", vec!["start".to_owned()])
    } else if workspace.join("package.json").exists() {
        ("npm", vec!["start".to_owned()])
    } else {
        ("cargo", vec!["run".to_owned()])
    };
    Ok(vec![RunConfiguration {
        name: "Run".to_owned(),
        command: command.to_owned(),
        args,
        cwd: ".".to_owned(),
    }])
}

fn resolve_cwd(workspace: &Path, requested: &str) -> Result<PathBuf> {
    let requested_path = Path::new(requested);
    if requested_path.is_absolute()
        || requested_path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        bail!("run configuration cwd escapes the workspace");
    }
    let cwd = workspace.join(requested_path).canonicalize()?;
    if !cwd.starts_with(workspace) {
        bail!("run configuration cwd escapes the workspace");
    }
    Ok(cwd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_escaping_working_directory() {
        assert!(resolve_cwd(Path::new("C:/workspace"), "../other").is_err());
    }
}
