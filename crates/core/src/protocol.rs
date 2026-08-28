use crate::WorkspaceSnapshot;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    OpenSource { path: String },
    SaveFile { path: String, content: String },
    Refresh,
    StartRun { configuration: String },
    StopRun,
    RestartRun { configuration: String },
    TerminalInput { data: String },
    ResizeTerminal { cols: u16, rows: u16 },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunConfiguration {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default = "default_cwd")]
    pub cwd: String,
}

fn default_cwd() -> String {
    ".".to_owned()
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessState {
    Idle,
    Running,
    Exited { code: Option<u32> },
    Failed { message: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ServerEvent<G> {
    Bootstrap {
        workspace: WorkspaceSnapshot,
        graph: G,
        run_configurations: Vec<RunConfiguration>,
    },
    WorkspaceChanged {
        workspace: WorkspaceSnapshot,
        graph: G,
    },
    SourceContent {
        path: String,
        content: String,
        version: u64,
    },
    FileSaved {
        path: String,
        version: u64,
    },
    TerminalOutput {
        data: String,
    },
    ProcessState {
        state: ProcessState,
    },
    Error {
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_variant_fields_for_the_typescript_client() {
        let event = ServerEvent::Bootstrap {
            workspace: WorkspaceSnapshot {
                name: "example".to_owned(),
                root: "example".to_owned(),
                entries: Vec::new(),
            },
            graph: (),
            run_configurations: vec![RunConfiguration {
                name: "Run".to_owned(),
                command: "cargo".to_owned(),
                args: vec!["run".to_owned()],
                cwd: ".".to_owned(),
            }],
        };
        let json = serde_json::to_value(event).expect("event json");
        assert!(json.get("runConfigurations").is_some());
        assert!(json.get("run_configurations").is_none());
    }
}
