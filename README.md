# Spatial Code

Spatial Code is a deliberately focused V1 experiment: open a real TypeScript project, understand its structure as a live 3D graph, edit the actual source, save it, and run it in an interactive terminal without leaving the spatial workspace.

The same interface works with a mouse and keyboard or in WebXR. Desktop support is intentional—the spatial interaction model can be developed and tested without repeatedly putting on a headset.

## What works

- Recursive TypeScript workspace discovery with `.gitignore` support and safe, workspace-contained file access
- Incremental Tree-sitter parsing for files, functions, classes, imports, exports, and call relationships
- Filesystem watching and live graph updates after in-app or external edits
- Draggable graph nodes with hover, selection, expand/collapse, focus, and back interactions
- Source locations that open the selected file and symbol
- A 3D code editor with cursor and selection movement, keyboard/paste input, scrolling, undo, redo, save, syntax color, and visible-line virtualization
- A true pseudo-terminal with stdout, stderr, stdin, Ctrl+C, resize support, bounded scrollback, and basic ANSI colors/control sequences
- Generic JSON run configurations with Run, Stop, and Restart controls
- A small interactive guessing game that demonstrates the entire workflow

## Architecture

```text
React + React Three Fiber + WebXR
                 │
              WebSocket
                 │
             Rust server
        ┌────────┼────────┐
        │        │        │
   Workspace  TS graph   Process
        │     Tree-sitter   │
      Files               PTY
```

The Rust crates keep UI concerns out of the core:

```text
crates/core                  workspace, source, protocol
crates/graph                 language-neutral program graph
crates/languages/typescript  LanguageAdapter + incremental parser
crates/terminal              portable PTY sessions
crates/processes             run configurations and lifecycle
crates/server                CLI, WebSocket, watcher, static hosting
apps/xr                      React/R3F/WebXR client
examples/guessing-game       V1 demonstration project
```

## Run in development

Requirements: current Rust, Node.js 22 or newer, and pnpm.

```bash
pnpm install
pnpm server
```

In a second terminal:

```bash
pnpm dev
```

Open `http://127.0.0.1:5173`. The server command opens `examples/guessing-game` by default.

To open another TypeScript project:

```bash
cargo run -p spatial-code-server -- /path/to/project
```

For a production-style local run, build the XR client and let Rust serve it:

```bash
pnpm build
cargo run -p spatial-code-server -- examples/guessing-game
```

Then open `http://127.0.0.1:4310`.

## Run configurations

Add `.spatial-code/run.json` inside the opened project. Either one object or an array is accepted:

```json
{
  "name": "Run",
  "command": "npm",
  "args": ["start"],
  "cwd": "."
}
```

The command is intentionally generic, so the same process subsystem can later launch Cargo, Python, .NET, Go, test runners, language servers, or debug adapters.

## Controls

- Point and select a node to open its real source.
- Drag a node to reorganize the graph.
- Double-click a node to focus it and its direct relationships.
- Right-click a node to collapse or expand its contained symbols.
- Select the editor, then type normally. Use Shift with cursor movement for selection, `Ctrl/Cmd+Z` for undo, and `Ctrl/Cmd+S` to save.
- Select the terminal before typing into an interactive program. `Ctrl+C` sends the terminal interrupt character.
- Use the background to orbit, pan, and zoom. All primary actions also appear in both the desktop and spatial toolbars.

## Verification

```bash
cargo test --workspace
pnpm test
pnpm lint
pnpm build
```

V1 intentionally excludes LSP features, autocomplete, diagnostics, debugging, execution tracing, React-specific understanding, browser previews, Git visualization, and AI editing. Those remain additive layers over the workspace, graph, editor, terminal, source-location, and process foundations built here.
