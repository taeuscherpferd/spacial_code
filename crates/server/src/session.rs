use anyhow::{Result, bail};
use notify::{RecursiveMode, Watcher};
use spatial_code_core::directories::DirectoryListing;
use spatial_code_core::{ClientMessage, ProcessState, ServerEvent, WorkspaceService};
use spatial_code_graph::ProgramGraph;
use spatial_code_processes::ProcessManager;
use spatial_code_terminal::TerminalEvent;
use spatial_code_typescript::{LanguageAdapter, TypeScriptAdapter};
use std::{path::Path, sync::Arc, time::Duration};
use tokio::sync::{Mutex, broadcast, mpsc};
use tokio::task::JoinHandle;
use tracing::error;

pub type SpatialEvent = ServerEvent<ProgramGraph>;

pub struct ProjectSession {
    workspace: WorkspaceService,
    adapter: TypeScriptAdapter,
    processes: ProcessManager,
    watcher: Option<JoinHandle<()>>,
    generation: u64,
    version: u64,
    active_run: Option<u64>,
}

impl ProjectSession {
    fn open(path: &Path, generation: u64) -> Result<Self> {
        let workspace = WorkspaceService::open(path)?;
        let processes = ProcessManager::open(workspace.root())?;
        Ok(Self {
            workspace,
            adapter: TypeScriptAdapter::new()?,
            processes,
            watcher: None,
            generation,
            version: 1,
            active_run: None,
        })
    }

    pub fn bootstrap(&mut self) -> Result<SpatialEvent> {
        Ok(SpatialEvent::Bootstrap {
            workspace: self.workspace.snapshot()?,
            graph: self.adapter.analyze(&self.workspace.source_files()?)?,
            run_configurations: self.processes.configurations().to_vec(),
        })
    }

    pub fn is_running(&self) -> bool {
        self.processes.is_running()
    }

    fn stop_run(&mut self, events: &broadcast::Sender<SpatialEvent>) -> Result<()> {
        self.processes.stop()?;
        self.active_run = None;
        let _ = events.send(SpatialEvent::ProcessState {
            state: ProcessState::Idle,
        });
        Ok(())
    }

    fn refresh(&mut self, events: &broadcast::Sender<SpatialEvent>) -> Result<()> {
        let workspace = self.workspace.snapshot()?;
        let graph = self.adapter.analyze(&self.workspace.source_files()?)?;
        self.version += 1;
        let _ = events.send(SpatialEvent::WorkspaceChanged { workspace, graph });
        Ok(())
    }
}

impl Drop for ProjectSession {
    fn drop(&mut self) {
        if let Some(watcher) = self.watcher.take() {
            watcher.abort();
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub session: Arc<Mutex<ProjectSession>>,
    pub events: broadcast::Sender<SpatialEvent>,
}

impl AppState {
    pub async fn open(path: &Path) -> Result<Self> {
        let session = ProjectSession::open(path, 1)?;
        let (events, _) = broadcast::channel(128);
        let state = Self {
            session: Arc::new(Mutex::new(session)),
            events,
        };
        let mut session = state.session.lock().await;
        session.watcher = Some(start_watcher(&state, &session)?);
        drop(session);
        Ok(state)
    }

    pub async fn handle(
        &self,
        message: ClientMessage,
        workspace_root: Option<&str>,
    ) -> Result<Option<SpatialEvent>> {
        let mut session = self.session.lock().await;
        if !matches!(
            message,
            ClientMessage::OpenWorkspace { .. } | ClientMessage::BrowseDirectories { .. }
        ) && workspace_root.is_some_and(|root| Path::new(root) != session.workspace.root())
        {
            bail!("project changed; retry in the current workspace");
        }
        match message {
            ClientMessage::BrowseDirectories { path } => {
                let requested = if path.is_empty() {
                    session.workspace.root()
                } else {
                    Path::new(&path)
                };
                return Ok(Some(SpatialEvent::DirectoriesListed {
                    listing: DirectoryListing::read(requested)?,
                }));
            }
            ClientMessage::OpenWorkspace { path } => {
                let mut next = ProjectSession::open(Path::new(&path), session.generation + 1)?;
                if next.workspace.root() == session.workspace.root() {
                    let _ = self.events.send(session.bootstrap()?);
                    return Ok(None);
                }
                let bootstrap = next.bootstrap()?;
                next.watcher = Some(start_watcher(self, &next)?);
                session.processes.stop()?;
                *session = next;
                let _ = self.events.send(bootstrap);
            }
            ClientMessage::OpenSource { path } => {
                let content = session.workspace.read_file(&path)?;
                let _ = self.events.send(SpatialEvent::SourceContent {
                    path,
                    content,
                    version: session.version,
                });
            }
            ClientMessage::SaveFile { path, content } => {
                session.workspace.write_file(&path, &content)?;
                session.version += 1;
                let _ = self.events.send(SpatialEvent::FileSaved {
                    path,
                    version: session.version,
                });
                session.refresh(&self.events)?;
            }
            ClientMessage::Refresh => session.refresh(&self.events)?,
            ClientMessage::StartRun { configuration } => {
                self.start_process(&mut session, &configuration)?
            }
            ClientMessage::RestartRun { configuration } => {
                session.stop_run(&self.events)?;
                self.start_process(&mut session, &configuration)?;
            }
            ClientMessage::StopRun => session.stop_run(&self.events)?,
            ClientMessage::TerminalInput { data } => session.processes.input(&data)?,
            ClientMessage::ResizeTerminal { cols, rows } => session.processes.resize(cols, rows)?,
        }
        Ok(None)
    }

    fn start_process(&self, session: &mut ProjectSession, configuration: &str) -> Result<()> {
        let (session_id, mut terminal_events) = session.processes.start(configuration)?;
        session.active_run = Some(session_id);
        let generation = session.generation;
        let _ = self.events.send(SpatialEvent::ProcessState {
            state: ProcessState::Running,
        });
        let state = self.clone();
        tokio::spawn(async move {
            while let Some(event) = terminal_events.recv().await {
                let mut current = state.session.lock().await;
                if current.generation != generation || current.active_run != Some(session_id) {
                    break;
                }
                let event = match event {
                    TerminalEvent::Output(data) => SpatialEvent::TerminalOutput { data },
                    TerminalEvent::Exited(code) => {
                        current.processes.mark_exited(session_id);
                        current.active_run = None;
                        SpatialEvent::ProcessState {
                            state: ProcessState::Exited { code },
                        }
                    }
                    TerminalEvent::Failed(message) => {
                        current.processes.mark_exited(session_id);
                        current.active_run = None;
                        SpatialEvent::ProcessState {
                            state: ProcessState::Failed { message },
                        }
                    }
                };
                let _ = state.events.send(event);
            }
        });
        Ok(())
    }
}

fn start_watcher(state: &AppState, session: &ProjectSession) -> Result<JoinHandle<()>> {
    let (changes, mut changed) = mpsc::unbounded_channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = changes.send(event);
    })?;
    watcher.watch(session.workspace.root(), RecursiveMode::Recursive)?;
    let generation = session.generation;
    let state = state.clone();
    Ok(tokio::spawn(async move {
        let _watcher = watcher;
        while let Some(event) = changed.recv().await {
            let should_refresh = event.is_ok_and(|event| {
                event.paths.iter().any(|path| {
                    path.extension()
                        .is_some_and(|extension| extension == "ts" || extension == "tsx")
                })
            });
            if !should_refresh {
                continue;
            }
            tokio::time::sleep(Duration::from_millis(120)).await;
            while changed.try_recv().is_ok() {}
            let mut current = state.session.lock().await;
            if current.generation != generation {
                break;
            }
            if let Err(error) = current.refresh(&state.events) {
                error!("workspace refresh failed: {error}");
            }
        }
    }))
}

#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;
