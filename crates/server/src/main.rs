use anyhow::{Context, Result};
use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::Method;
use axum::response::IntoResponse;
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use notify::{RecursiveMode, Watcher};
use spatial_code_core::{ClientMessage, ProcessState, ServerEvent, WorkspaceService};
use spatial_code_graph::ProgramGraph;
use spatial_code_processes::ProcessManager;
use spatial_code_terminal::TerminalEvent;
use spatial_code_typescript::{LanguageAdapter, TypeScriptAdapter};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, broadcast, mpsc};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing::{error, info};

type SpatialEvent = ServerEvent<ProgramGraph>;

#[derive(Parser, Debug)]
#[command(
    name = "spatial-code",
    version,
    about = "Explore TypeScript projects spatially"
)]
struct Arguments {
    #[arg(default_value = ".")]
    workspace: PathBuf,
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    #[arg(long, default_value_t = 4310)]
    port: u16,
}

#[derive(Clone)]
struct AppState {
    workspace: Arc<WorkspaceService>,
    adapter: Arc<Mutex<TypeScriptAdapter>>,
    processes: Arc<Mutex<ProcessManager>>,
    events: broadcast::Sender<SpatialEvent>,
    version: Arc<AtomicU64>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "spatial_code=info".into()),
        )
        .init();
    let arguments = Arguments::parse();
    let workspace = Arc::new(WorkspaceService::open(&arguments.workspace)?);
    let adapter = Arc::new(Mutex::new(TypeScriptAdapter::new()?));
    let processes = Arc::new(Mutex::new(ProcessManager::open(workspace.root())?));
    let (events, _) = broadcast::channel(128);
    let state = AppState {
        workspace,
        adapter,
        processes,
        events,
        version: Arc::new(AtomicU64::new(1)),
    };
    start_watcher(state.clone())?;

    let frontend = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../apps/xr/dist")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("apps/xr/dist"));
    let static_service =
        ServeDir::new(&frontend).not_found_service(ServeFile::new(frontend.join("index.html")));
    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok" }))
        .route("/ws", axum::routing::get(websocket_handler))
        .fallback_service(static_service)
        .layer(
            CorsLayer::new()
                .allow_methods([Method::GET])
                .allow_origin(Any),
        )
        .with_state(state);
    let address = format!("{}:{}", arguments.host, arguments.port);
    let listener = TcpListener::bind(&address).await?;
    info!("Spatial Code opened {}", arguments.workspace.display());
    info!("Open http://{address}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn websocket_handler(
    State(state): State<AppState>,
    upgrade: WebSocketUpgrade,
) -> impl IntoResponse {
    upgrade.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    match bootstrap_event(&state).await {
        Ok(event) => {
            if send_event(&mut socket, &event).await.is_err() {
                return;
            }
            let process_is_running = state.processes.lock().await.is_running();
            if process_is_running
                && send_event(
                    &mut socket,
                    &SpatialEvent::ProcessState {
                        state: ProcessState::Running,
                    },
                )
                .await
                .is_err()
            {
                return;
            }
        }
        Err(error) => {
            let _ = send_event(
                &mut socket,
                &SpatialEvent::Error {
                    message: error.to_string(),
                },
            )
            .await;
            return;
        }
    }

    let mut receiver = state.events.subscribe();
    let (mut sender, mut incoming) = socket.split();
    let outgoing = tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let Ok(json) = serde_json::to_string(&event) else {
                continue;
            };
            if sender.send(Message::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(message)) = incoming.next().await {
        if let Message::Text(text) = message {
            match serde_json::from_str::<ClientMessage>(&text) {
                Ok(message) => handle_client_message(message, state.clone()).await,
                Err(error) => broadcast_error(&state, format!("invalid message: {error}")),
            }
        }
    }
    outgoing.abort();
}

async fn handle_client_message(message: ClientMessage, state: AppState) {
    let result = match message {
        ClientMessage::OpenSource { path } => open_source(&state, path),
        ClientMessage::SaveFile { path, content } => save_file(&state, path, content).await,
        ClientMessage::Refresh => refresh_workspace(&state).await,
        ClientMessage::StartRun { configuration } => start_process(&state, configuration).await,
        ClientMessage::RestartRun { configuration } => {
            let _ = stop_process(&state).await;
            start_process(&state, configuration).await
        }
        ClientMessage::StopRun => stop_process(&state).await,
        ClientMessage::TerminalInput { data } => state.processes.lock().await.input(&data),
        ClientMessage::ResizeTerminal { cols, rows } => {
            state.processes.lock().await.resize(cols, rows)
        }
    };
    if let Err(error) = result {
        broadcast_error(&state, error.to_string());
    }
}

fn open_source(state: &AppState, path: String) -> Result<()> {
    let content = state.workspace.read_file(&path)?;
    let version = state.version.load(Ordering::Relaxed);
    let _ = state.events.send(SpatialEvent::SourceContent {
        path,
        content,
        version,
    });
    Ok(())
}

async fn save_file(state: &AppState, path: String, content: String) -> Result<()> {
    state.workspace.write_file(&path, &content)?;
    let version = state.version.fetch_add(1, Ordering::Relaxed) + 1;
    let _ = state.events.send(SpatialEvent::FileSaved { path, version });
    refresh_workspace(state).await
}

async fn start_process(state: &AppState, configuration: String) -> Result<()> {
    let (session_id, mut terminal_events) = state.processes.lock().await.start(&configuration)?;
    let _ = state.events.send(SpatialEvent::ProcessState {
        state: ProcessState::Running,
    });
    let background_state = state.clone();
    tokio::spawn(async move {
        while let Some(event) = terminal_events.recv().await {
            match event {
                TerminalEvent::Output(data) => {
                    let _ = background_state
                        .events
                        .send(SpatialEvent::TerminalOutput { data });
                }
                TerminalEvent::Exited(code) => {
                    if background_state
                        .processes
                        .lock()
                        .await
                        .mark_exited(session_id)
                    {
                        let _ = background_state.events.send(SpatialEvent::ProcessState {
                            state: ProcessState::Exited { code },
                        });
                    }
                }
                TerminalEvent::Failed(message) => {
                    if background_state
                        .processes
                        .lock()
                        .await
                        .mark_exited(session_id)
                    {
                        let _ = background_state.events.send(SpatialEvent::ProcessState {
                            state: ProcessState::Failed { message },
                        });
                    }
                }
            }
        }
    });
    Ok(())
}

async fn stop_process(state: &AppState) -> Result<()> {
    state.processes.lock().await.stop()?;
    let _ = state.events.send(SpatialEvent::ProcessState {
        state: ProcessState::Idle,
    });
    Ok(())
}

async fn bootstrap_event(state: &AppState) -> Result<SpatialEvent> {
    let workspace = state.workspace.snapshot()?;
    let files = state.workspace.source_files()?;
    let graph = state.adapter.lock().await.analyze(&files)?;
    let run_configurations = state.processes.lock().await.configurations().to_vec();
    Ok(SpatialEvent::Bootstrap {
        workspace,
        graph,
        run_configurations,
    })
}

async fn refresh_workspace(state: &AppState) -> Result<()> {
    let workspace = state.workspace.snapshot()?;
    let files = state.workspace.source_files()?;
    let graph = state.adapter.lock().await.analyze(&files)?;
    state.version.fetch_add(1, Ordering::Relaxed);
    let _ = state
        .events
        .send(SpatialEvent::WorkspaceChanged { workspace, graph });
    Ok(())
}

fn start_watcher(state: AppState) -> Result<()> {
    let (changes, mut changed) = mpsc::channel(32);
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = changes.blocking_send(event);
    })?;
    watcher.watch(state.workspace.root(), RecursiveMode::Recursive)?;
    tokio::spawn(async move {
        let _watcher = watcher;
        while let Some(event) = changed.recv().await {
            let should_refresh = event.is_ok_and(|event| {
                event
                    .paths
                    .iter()
                    .any(|path| path.extension().is_some_and(|extension| extension == "ts"))
            });
            if !should_refresh {
                continue;
            }
            tokio::time::sleep(Duration::from_millis(120)).await;
            while changed.try_recv().is_ok() {}
            if let Err(error) = refresh_workspace(&state).await {
                error!("workspace refresh failed: {error}");
            }
        }
    });
    Ok(())
}

async fn send_event(socket: &mut WebSocket, event: &SpatialEvent) -> Result<()> {
    let json = serde_json::to_string(event)?;
    socket
        .send(Message::Text(json.into()))
        .await
        .context("websocket closed")
}

fn broadcast_error(state: &AppState, message: String) {
    let _ = state.events.send(SpatialEvent::Error { message });
}
