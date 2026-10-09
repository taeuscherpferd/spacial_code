# Spatial Code

Spatial Code is a deliberately focused V1 experiment: open a real TypeScript project, understand its structure as a live 3D graph, edit the actual source, save it, and run it in an interactive terminal without leaving the spatial workspace.

The same interface works with a mouse and keyboard or in WebXR. Desktop support is intentional—the spatial interaction model can be developed and tested without repeatedly putting on a headset.

## What works

- Runtime project selection from the desktop workspace header or VR folder browser, with recent projects and unsaved-edit confirmation
- A controller-operated VR workspace bar with expandable folders, paginated source files, and project switching
- Recursive TypeScript workspace discovery with `.gitignore` support and safe, workspace-contained file access
- Incremental Tree-sitter parsing for files, functions, classes, imports, exports, and call relationships
- Filesystem watching and live graph updates after in-app or external edits
- Deterministic 3D file clusters with symbols distributed around their parents and spacing reserved for nested contents
- Draggable graph nodes with hover, selection, expand/collapse, focus, and back interactions
- Source locations that open the selected file and symbol
- A desktop DOM editor dock below the central graph, with shared syntax colors, diagnostic underlines, native text editing, and a terminal tab
- A VR code editor with measured monospace text, accurate pointer placement, drag/keyboard selection, tab stops, automatic indentation, horizontal/vertical scrolling, undo/redo, save, syntax colors, and visible-line virtualization
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

Without a local certificate, open `http://127.0.0.1:5174` for desktop development. The server command initially opens `examples/react-starter`. Select **Choose project** in the workspace bar to browse folders or enter a project path without restarting. Paths refer to the computer running the Rust server, including when the interface runs on a headset.

For trusted local HTTPS from a headset, install [mkcert](https://github.com/FiloSottile/mkcert), run `mkcert -install` once to trust its local CA on this computer, then run `pnpm https:cert` and `pnpm dev`. Open the printed `https://` LAN address on your headset and install the printed `rootCA.pem` certificate as a trusted CA there too. Keep the corresponding private key on your development computer. Both devices must be on the same local network. The app and WebSocket proxy continue to run on your computer. If your LAN address changes, rerun `pnpm https:cert`.

To choose the initial TypeScript project from the command line:

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

Connected clients receive workspace updates in server order. If a slow connection loses broadcast events, it reconnects automatically and reloads the active workspace.

## Controls

- In the desktop workspace header, select **Choose project**, navigate folders with **Up**, then select **Open this folder**. You can also browse or open a typed path, or switch back to a recent project. Unsaved editor changes require **Keep draft & open** confirmation. Each client keeps unsaved drafts by project and file, including when another client switches the shared project. Return to the project and reopen the file to restore its draft against the latest saved source. Drafts remain in that client until the page is reloaded. A successful switch stops the previous project’s running process and clears its editor, terminal, graph selection, focus, and layout; a failed open keeps the current project available. The server has one active project shared by all connected clients. Recent projects are remembered until the page is reloaded.
- In VR, the workspace bar appears to your left. Use controller triggers to expand folders and open files, and **Previous / Next** to page through the list. Select **Choose**, browse server folders, and select **Open folder** to switch projects, or use **Recent**. Press the left controller’s lower face button (X on Quest/Touch) to hide or show the bar; showing it again places it beside your current location and heading. The bar stays anchored independently of graph movement.

- In VR, hold either controller’s grip button and move your hand to move the whole graph, including toward or away from you. Hold both grips and spread your hands apart to enlarge the graph, or bring them together to shrink it (0.1×–10×). Release either grip to continue moving with the other; release both to leave the graph in place. Grips work anywhere, without pointing at a node.
- VR triggers still select and drag individual nodes. Press the right controller’s lower face button (A on Quest/Touch controllers) to toggle the editor. It starts hidden, appears to your right facing you, and stays anchored there. Toggle it off and on to reposition it beside your current location and heading. Selecting a node updates its source without opening the hidden editor. The editor, terminal, and toolbar do not move with the graph.
- Point and select a node to open its real source.
- Drag a node to reorganize the graph on a view-facing plane, preserving all three coordinates. Orbit to another angle to adjust its depth.
- File clusters extend into depth; selecting a file reveals its surrounding symbols without rearranging the layout. Labels face the viewer.
- Function nodes include declarations, generators, and named variables initialized with arrow functions or function expressions. Exported symbols keep their dotted orange connections.
- Double-click a node to focus it and its direct relationships.
- Right-click a node to collapse or expand its contained symbols.
- In the desktop bottom dock, select Editor to edit source or Terminal to interact with a running program. The native textarea supports selection, scrolling, clipboard, undo/redo, and Ctrl/Cmd+S saving; a synchronized highlight layer displays syntax colors and diagnostic underlines, and the header reports syntax diagnostic counts.
- In VR, select the editor, then type normally. Drag over text or Shift-click to select. Shift+wheel scrolls horizontally; cursor movement reveals long lines automatically. Hover or place the cursor over an error underline to read its message. Use Shift with cursor movement for selection, `Ctrl/Cmd+Z` for undo, and `Ctrl/Cmd+S` to save.
- In VR, virtual keyboard edits use the spatial editor's cursor and selection. Text composition appears live, including deletion, and remains one undo step. Select the **Keyboard** button (highlighted on hover) in the editor header to open or reopen the VR keyboard. Selecting text or moving the cursor never requests keyboard focus in VR. The headset edits an isolated persistent buffer that is not rewritten between keystrokes or at composition end; edits are applied at the spatial cursor without exposing surrounding source to native selection or composition replacement.
- Select the terminal before typing into an interactive program. `Ctrl+C` sends the terminal interrupt character.
- On desktop, drag the background to orbit, right-drag to pan, and scroll to zoom. Primary actions appear in the desktop toolbar and the VR spatial toolbar.

## Verification

Server tests inject filesystem events into the watcher handler to verify project switching and graph refresh deterministically. Production uses the platform's native watcher; these tests do not verify OS notification delivery.

```bash
cargo test --workspace
pnpm test
pnpm lint
pnpm build
```

The desktop editor uses a native DOM textarea over an aria-hidden highlighted layer below the graph. Both layers share font metrics and scroll positions, including after source navigation and resizing. Desktop and VR reuse the tokenizer, syntax palette, and diagnostic range clipping; the lightweight line tokenizer covers common keywords, strings, numbers, and single-line comments, rather than full language parsing. The VR editor draws a high-resolution canvas texture inside the 3D scene, including selections, caret, syntax colors, and diagnostics. Text input supports physical keyboards and experimental headset virtual keyboards with IME composition. Quest keyboard behavior still requires validation on the headset. Diagnostics reuse the TypeScript compiler and currently report syntax errors only; they do not load project tsconfig, resolve imports, type-check the project, or apply ESLint rules.

Monaco and CodeMirror provide DOM-based editor views, which are not drop-in immersive 3D surfaces. A future integration can reuse editor state/commands and language services behind this VR rendering surface.

V1 intentionally excludes full LSP features, autocomplete, project type checking/linting, debugging, execution tracing, React-specific understanding, browser previews, Git visualization, and AI editing. Those remain additive layers over the workspace, graph, editor, terminal, source-location, and process foundations built here.
