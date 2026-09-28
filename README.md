# Spatial Code

Spatial Code is a deliberately focused V1 experiment: open a real TypeScript project, understand its structure as a live 3D graph, edit the actual source, save it, and run it in an interactive terminal without leaving the spatial workspace.

The same interface works with a mouse and keyboard or in WebXR. Desktop support is intentional—the spatial interaction model can be developed and tested without repeatedly putting on a headset.

## What works

- Recursive TypeScript workspace discovery with `.gitignore` support and safe, workspace-contained file access
- Incremental Tree-sitter parsing for files, functions, classes, imports, exports, and call relationships
- Filesystem watching and live graph updates after in-app or external edits
- Deterministic 3D file clusters with symbols distributed around their parents and spacing reserved for nested contents
- Draggable graph nodes with hover, selection, expand/collapse, focus, and back interactions
- Source locations that open the selected file and symbol
- A 3D code editor with measured monospace text, accurate pointer placement, drag/keyboard selection, tab stops, automatic indentation, horizontal/vertical scrolling, undo/redo, save, syntax colors, and visible-line virtualization
- Live TypeScript/JavaScript syntax diagnostics in a background worker, with error underlines and messages at the hovered location or cursor
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
pnpm dev
```

Without a local certificate, open `http://127.0.0.1:5173` for desktop development. The server command opens `examples/guessing-game` by default.

For trusted local HTTPS from a headset, install [mkcert](https://github.com/FiloSottile/mkcert), run `mkcert -install` once to trust its local CA on this computer, then run `pnpm https:cert` and `pnpm dev`. Open the printed `https://` LAN address on your headset and install the printed `rootCA.pem` certificate as a trusted CA there too. Keep the corresponding private key on your development computer. Both devices must be on the same local network. The app and WebSocket proxy continue to run on your computer. If your LAN address changes, rerun `pnpm https:cert`.

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
- Drag a node to reorganize the graph on a view-facing plane, preserving all three coordinates. Orbit to another angle to adjust its depth.
- File clusters extend into depth; selecting a file reveals its surrounding symbols without rearranging the layout. Labels face the viewer.
- Double-click a node to focus it and its direct relationships.
- Right-click a node to collapse or expand its contained symbols.
- Select the editor, then type normally. Drag over text or Shift-click to select. Shift+wheel scrolls horizontally; cursor movement reveals long lines automatically. Hover or place the cursor over an error underline to read its message. Use Shift with cursor movement for selection, `Ctrl/Cmd+Z` for undo, and `Ctrl/Cmd+S` to save.
- Select the terminal before typing into an interactive program. `Ctrl+C` sends the terminal interrupt character.
- On desktop, drag the background to orbit, right-drag to pan, and scroll to zoom. All primary actions also appear in both the desktop and spatial toolbars.

## Verification

```bash
cargo test --workspace
pnpm test
pnpm lint
pnpm build
```

The editor draws a high-resolution canvas texture inside the 3D scene, so its text, selections, caret, and diagnostics are visible in both desktop and immersive WebXR. Text input currently requires a physical keyboard; headset virtual keyboards and IME composition are not implemented. Diagnostics reuse the TypeScript compiler and currently report syntax errors only; they do not load project tsconfig, resolve imports, type-check the project, or apply ESLint rules.

Monaco and CodeMirror provide DOM-based editor views, which are not drop-in immersive 3D surfaces. A future integration can reuse editor state/commands and language services behind this VR rendering surface.

V1 intentionally excludes full LSP features, autocomplete, project type checking/linting, debugging, execution tracing, React-specific understanding, browser previews, Git visualization, and AI editing. Those remain additive layers over the workspace, graph, editor, terminal, source-location, and process foundations built here.
