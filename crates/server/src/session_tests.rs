use super::*;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);

struct Projects(PathBuf);

impl Projects {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "spatial-switch-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        for name in ["first", "second", "invalid"] {
            fs::create_dir_all(root.join(name)).unwrap();
        }
        fs::write(root.join("first/main.ts"), "export function first() {}").unwrap();
        fs::write(root.join("second/main.ts"), "export function second() {}").unwrap();
        fs::create_dir_all(root.join("invalid/.spatial-code")).unwrap();
        fs::write(root.join("invalid/.spatial-code/run.json"), "invalid json").unwrap();
        Self(root.canonicalize().unwrap())
    }

    fn path(&self, name: &str) -> String {
        self.0.join(name).to_string_lossy().into_owned()
    }
}

impl Drop for Projects {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[tokio::test]
async fn switches_projects_and_can_switch_back_with_new_parser_and_processes() {
    let fixture = Projects::new();
    let state = AppState::open(Path::new(&fixture.path("first")))
        .await
        .unwrap();
    let mut events = state.events.subscribe();
    for name in ["second", "first"] {
        state
            .handle(
                ClientMessage::OpenWorkspace {
                    path: fixture.path(name),
                },
                None,
            )
            .await
            .unwrap();
        let SpatialEvent::Bootstrap {
            workspace,
            graph,
            run_configurations,
        } = events.recv().await.unwrap()
        else {
            panic!("expected bootstrap")
        };
        assert_eq!(workspace.root, fixture.path(name));
        assert!(graph.nodes.iter().any(|node| node.name == name));
        assert!(
            !graph
                .nodes
                .iter()
                .any(|node| node.name == if name == "first" { "second" } else { "first" })
        );
        assert_eq!(run_configurations.len(), 1);
        assert!(!state.session.lock().await.is_running());
    }
    assert_eq!(state.session.lock().await.generation, 3);
}

#[tokio::test]
async fn rejected_projects_preserve_current_session_and_same_project_is_a_noop() {
    let fixture = Projects::new();
    let state = AppState::open(Path::new(&fixture.path("first")))
        .await
        .unwrap();
    let mut events = state.events.subscribe();
    for name in ["missing", "invalid", "first/main.ts"] {
        assert!(
            state
                .handle(
                    ClientMessage::OpenWorkspace {
                        path: fixture.path(name)
                    },
                    None
                )
                .await
                .is_err()
        );
        let session = state.session.lock().await;
        assert_eq!(session.workspace.root(), Path::new(&fixture.path("first")));
        assert_eq!(session.generation, 1);
        assert!(events.try_recv().is_err());
    }
    let response = state
        .handle(
            ClientMessage::OpenWorkspace {
                path: fixture.path("first"),
            },
            None,
        )
        .await
        .unwrap();
    assert!(response.is_none());
    assert!(matches!(
        events.recv().await.unwrap(),
        SpatialEvent::Bootstrap { .. }
    ));
    assert_eq!(state.session.lock().await.generation, 1);
}

#[tokio::test]
async fn reopening_then_switching_broadcasts_bootstraps_in_order_to_all_clients() {
    let fixture = Projects::new();
    let state = AppState::open(Path::new(&fixture.path("first")))
        .await
        .unwrap();
    let mut first_client = state.events.subscribe();
    let mut second_client = state.events.subscribe();
    for name in ["first", "second"] {
        let response = state
            .handle(
                ClientMessage::OpenWorkspace {
                    path: fixture.path(name),
                },
                None,
            )
            .await
            .unwrap();
        assert!(response.is_none());
    }
    for client in [&mut first_client, &mut second_client] {
        for name in ["first", "second"] {
            let SpatialEvent::Bootstrap { workspace, .. } = client.try_recv().unwrap() else {
                panic!("expected bootstrap")
            };
            assert_eq!(workspace.root, fixture.path(name));
        }
        assert!(client.try_recv().is_err());
    }
}

#[tokio::test]
async fn directory_browsing_is_private_and_does_not_change_project() {
    let fixture = Projects::new();
    let state = AppState::open(Path::new(&fixture.path("first")))
        .await
        .unwrap();
    let mut events = state.events.subscribe();
    for path in [String::new(), fixture.path("second")] {
        let response = state
            .handle(ClientMessage::BrowseDirectories { path }, None)
            .await
            .unwrap();
        assert!(matches!(
            response,
            Some(SpatialEvent::DirectoriesListed { .. })
        ));
        assert!(events.try_recv().is_err());
        assert_eq!(state.session.lock().await.generation, 1);
    }
}

#[tokio::test]
async fn replacement_watcher_refreshes_new_project() {
    let fixture = Projects::new();
    let state = AppState::open(Path::new(&fixture.path("first")))
        .await
        .unwrap();
    state
        .handle(
            ClientMessage::OpenWorkspace {
                path: fixture.path("second"),
            },
            None,
        )
        .await
        .unwrap();
    let mut events = state.events.subscribe();
    fs::write(
        fixture.0.join("second/main.ts"),
        "export function updated() {}",
    )
    .unwrap();
    let event = tokio::time::timeout(Duration::from_secs(3), events.recv())
        .await
        .unwrap()
        .unwrap();
    let SpatialEvent::WorkspaceChanged { workspace, graph } = event else {
        panic!("expected refresh")
    };
    assert_eq!(workspace.root, fixture.path("second"));
    assert!(graph.nodes.iter().any(|node| node.name == "updated"));
}

#[cfg(unix)]
#[tokio::test]
async fn switching_stops_old_process_and_invalid_project_keeps_it_running() {
    let fixture = Projects::new();
    fs::create_dir_all(fixture.0.join("first/.spatial-code")).unwrap();
    fs::write(
        fixture.0.join("first/.spatial-code/run.json"),
        r#"{"name":"Wait","command":"sh","args":["-c","cat"],"cwd":"."}"#,
    )
    .unwrap();
    let state = AppState::open(Path::new(&fixture.path("first")))
        .await
        .unwrap();
    state
        .handle(
            ClientMessage::StartRun {
                configuration: "Wait".into(),
            },
            None,
        )
        .await
        .unwrap();
    assert!(state.session.lock().await.is_running());
    assert!(
        state
            .handle(
                ClientMessage::OpenWorkspace {
                    path: fixture.path("invalid")
                },
                None
            )
            .await
            .is_err()
    );
    assert!(state.session.lock().await.is_running());
    state
        .handle(
            ClientMessage::OpenWorkspace {
                path: fixture.path("second"),
            },
            None,
        )
        .await
        .unwrap();
    assert!(!state.session.lock().await.is_running());
    assert!(
        state
            .handle(
                ClientMessage::TerminalInput {
                    data: "old input".into()
                },
                None
            )
            .await
            .is_err()
    );
}

#[tokio::test]
async fn stale_client_commands_cannot_edit_the_replacement_project() {
    let fixture = Projects::new();
    let state = AppState::open(Path::new(&fixture.path("first")))
        .await
        .unwrap();
    state
        .handle(
            ClientMessage::OpenWorkspace {
                path: fixture.path("second"),
            },
            None,
        )
        .await
        .unwrap();
    let stale_root = fixture.path("first");
    for message in [
        ClientMessage::SaveFile {
            path: "main.ts".into(),
            content: "stale edit".into(),
        },
        ClientMessage::OpenSource {
            path: "main.ts".into(),
        },
        ClientMessage::StartRun {
            configuration: "Run".into(),
        },
    ] {
        assert!(state.handle(message, Some(&stale_root)).await.is_err());
    }
    assert_eq!(
        fs::read_to_string(fixture.0.join("second/main.ts")).unwrap(),
        "export function second() {}"
    );
    let current_root = fixture.path("second");
    state
        .handle(
            ClientMessage::OpenSource {
                path: "main.ts".into(),
            },
            Some(&current_root),
        )
        .await
        .unwrap();
}
