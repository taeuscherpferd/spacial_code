use anyhow::{Context, Result};
use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::Method;
use axum::response::IntoResponse;
use clap::Parser;
use futures_util::StreamExt;
use spatial_code_core::ProcessState;
use spatial_code_core::protocol::ClientRequest;
use std::path::PathBuf;
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;

mod session;
mod socket_events;
use session::{AppState, SpatialEvent};

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

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "spatial_code=info".into()),
        )
        .init();
    let arguments = Arguments::parse();
    let state = AppState::open(&arguments.workspace).await?;

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
    let (bootstrap, process_is_running, receiver) = {
        let mut session = state.session.lock().await;
        let receiver = state.events.subscribe();
        (session.bootstrap(), session.is_running(), receiver)
    };
    match bootstrap {
        Ok(event) => {
            if send_event(&mut socket, &event).await.is_err() {
                return;
            }
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

    let (responses, response_events) = mpsc::unbounded_channel();
    let (sender, mut incoming) = socket.split();
    let mut outgoing = tokio::spawn(socket_events::forward_events(
        sender,
        receiver,
        response_events,
    ));

    loop {
        let message = tokio::select! {
            _ = &mut outgoing => break,
            message = incoming.next() => match message {
                Some(Ok(message)) => message,
                _ => break,
            },
        };
        if let Message::Text(text) = message {
            match serde_json::from_str::<ClientRequest>(&text) {
                Ok(request) => match state
                    .handle(request.message, request.workspace_root.as_deref())
                    .await
                {
                    Ok(Some(event)) => {
                        let _ = responses.send(event);
                    }
                    Ok(None) => {}
                    Err(error) => {
                        let _ = responses.send(SpatialEvent::Error {
                            message: error.to_string(),
                        });
                    }
                },
                Err(error) => {
                    let _ = responses.send(SpatialEvent::Error {
                        message: format!("invalid message: {error}"),
                    });
                }
            }
        }
    }
    outgoing.abort();
}

async fn send_event(socket: &mut WebSocket, event: &SpatialEvent) -> Result<()> {
    let json = serde_json::to_string(event)?;
    socket
        .send(Message::Text(json.into()))
        .await
        .context("websocket closed")
}
