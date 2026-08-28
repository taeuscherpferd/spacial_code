Yes. I’d write the two plans so that **V1 is the first vertical slice of the final product**, not a prototype that later gets discarded.

The most important architectural decision is this:

```text
                    Spatial IDE
                         │
                         ▼
                 Generic Program Graph
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    Static code       Runtime          Debugger
    analysis          tracing            state
        │                │                │
  Tree-sitter/LSP   instrumentation       DAP
```

Tree-sitter gives us incremental structural parsing; LSP gives semantic IDE information such as definitions and references; and DAP gives us a language-independent debugger interface. LSP is explicitly intended to let development tools reuse language-specific intelligence, while DAP does the same thing for debuggers. ([Microsoft GitHub][1])

That means the full product doesn't eventually become a giant pile of `if language == Python` code.

---

# Plan A — Fully Spec'd End Version

I'll call the project **Spatial Code** here just to give things names.

## 1. Overall architecture

```text
                       ┌────────────────────────┐
                       │      XR CLIENT         │
                       │                        │
                       │ React                  │
                       │ R3F                    │
                       │ WebXR                  │
                       │ react-three-uikit      │
                       └───────────┬────────────┘
                                   │
                             WebSocket/RPC
                                   │
                       ┌───────────▼────────────┐
                       │       RUST CORE        │
                       │                        │
                       │ Workspace manager      │
                       │ Program graph          │
                       │ Source buffers         │
                       │ Process manager        │
                       │ Terminal/PTTY          │
                       │ LSP host               │
                       │ DAP host               │
                       │ Trace recorder         │
                       │ Git/change sets        │
                       │ Agent engine           │
                       └───────────┬────────────┘
                                   │
           ┌───────────────────────┼─────────────────────────┐
           │                       │                         │
           ▼                       ▼                         ▼
    Language adapters       Framework adapters       Runtime adapters

    TypeScript              React                    Browser
    Rust                    ASP.NET                  Node
    Python                  FastAPI                  .NET
    C#                      Axum                     Python
    Go                      etc.                     Native
    Java
    ...
```

The React/R3F/WebXR client never parses TypeScript itself.

It receives things like:

```ts
interface GraphNode {
    id: string
    kind: NodeKind
    name: string
    source?: SourceLocation
    metadata: Record<string, unknown>
}

interface GraphEdge {
    from: string
    to: string
    kind: EdgeKind
    metadata: Record<string, unknown>
}
```

That's the fundamental contract.

---

# 2. Unified program graph

Everything eventually contributes information to one graph.

### Node types

```text
Workspace
Package
Project
Directory
File
Module

Class
Interface
Trait
Struct
Enum
Function
Method
Variable

Component
Hook
Route
Endpoint
Service
Database

Test
Process
Thread
Runtime instance
Network request
UI element
```

### Relationship types

```text
contains
imports
exports
calls
references
extends
implements
reads
writes
constructs
renders
routes-to
depends-on
tests
observed-call
runtime-parent
state-update
network-request
```

And crucially:

```text
Static edges:
    A ──────► B

Observed runtime edges:
    A ══════► B
```

That lets us distinguish:

> "Static analysis says this can happen"

from:

> "We watched this happen."

---

# 3. Spatial workspace

The XR application gets several graph modes rather than attempting to show everything simultaneously.

### Architecture mode

```text
               Application
                   │
       ┌───────────┼────────────┐
       ▼           ▼            ▼
    Frontend      API         Worker
```

### File/module mode

```text
src/
 ├─ auth
 ├─ users
 ├─ billing
 └─ shared
```

### Symbol mode

```text
UserService
    │
    ├── getUser()
    ├── updateUser()
    └── deleteUser()
```

### Call graph

```text
handleSubmit
     │
     ▼
validate
     │
     ▼
updateUser
```

### Runtime mode

```text
User click
    ║
    ▼
handleSubmit
    ║
    ▼
updateUser
    ║
    ▼
HTTP
```

The same project graph feeds all of these.

---

# 4. Progressive disclosure

This will be essential.

From across the room:

```text
          BILLING
```

Move closer:

```text
        Billing
        /     \
       UI     API
```

Select API:

```text
BillingController
       │
       ▼
BillingService
       │
       ▼
StripeClient
```

Grab `BillingService`:

```text
BillingService.ts
─────────────────────────
class BillingService {
    ...
}
```

You should never see 40,000 graph edges simultaneously.

---

# 5. Full code editor

Eventually the VR editor supports:

* editing
* undo/redo
* multiple cursors
* selection
* copy/paste
* search
* syntax highlighting
* diagnostics
* autocomplete
* go-to-definition
* find references
* rename
* code actions
* formatting
* Git diff decorations
* breakpoints
* inline runtime values

LSP supplies most of the language intelligence. Its purpose is specifically to separate these editor features from the language implementation. ([Microsoft GitHub][1])

So:

```text
VR editor
    │
    ▼
Rust LSP client
    │
    ├── typescript-language-server
    ├── rust-analyzer
    ├── Python language server
    └── C# language server
```

---

# 6. Integrated terminal

The Rust backend owns real PTYs.

```text
VR Terminal
     │
     ▼
Rust PTY manager
     │
     ├── pnpm dev
     ├── cargo run
     ├── dotnet run
     └── python main.py
```

It supports:

```text
stdout
stderr
stdin
ANSI
resize
Ctrl+C
interactive processes
multiple terminals
```

This isn't just convenience infrastructure.

DAP explicitly supports asking the development environment to launch a debuggee inside its integrated terminal through `runInTerminal`, so building the terminal correctly early gives us infrastructure the debugger later reuses. ([Microsoft GitHub][2])

---

# 7. Program previews

Preview becomes another generic abstraction:

```rust
trait PreviewProvider {
    fn start(...);
    fn stop(...);
    fn frames(...);
    fn input(...);
}
```

Implementations might eventually be:

```text
TerminalPreview
BrowserPreview
DesktopCapturePreview
GamePreview
ImagePreview
CustomPluginPreview
```

Therefore:

### CLI program

```text
┌────────────────────────┐
│ $ cargo run            │
│ Starting server...     │
└────────────────────────┘
```

### React

```text
┌────────────────────────┐
│      actual app        │
│                        │
│ [ Save ] [ Cancel ]    │
└────────────────────────┘
```

### Desktop application

```text
┌────────────────────────┐
│ streamed application   │
└────────────────────────┘
```

---

# 8. Debug mode

This becomes a major subsystem.

And I'd deliberately split debugging into **two different concepts**.

## Traditional debugger

Use **DAP**.

DAP provides a standardized abstraction for things including breakpoints, threads, stack frames, scopes, variables, stepping, watches, debug consoles, and exception behavior. ([Microsoft GitHub][2])

```text
                  Spatial Code
                       │
                    DAP Host
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
    JS debugger      debugpy        .NET debugger
       │               │                │
    JavaScript        Python             C#
```

Spatially:

```text
main()
  │
  ▼
loadUser()
  │
  ▼
processUser()   ◄── BREAKPOINT
  │
  ▼
saveUser()
```

When execution stops:

```text
                    VARIABLES

                  user
                /      \
             name      address
                        /    \
                      city   zip
```

You could literally inspect an object spatially.

---

# 9. Execution tracing mode

This is separate from DAP.

Debugger:

> Stop execution and inspect it.

Tracing:

> Let it execute normally and record what happened.

Modes might be:

| Mode               | Instrumentation |
| ------------------ | --------------- |
| Normal             | None            |
| Architecture Trace | Very low        |
| Function Trace     | Moderate        |
| Performance Trace  | Moderate/high   |
| Data Trace         | High            |
| Full Debugger      | On-demand       |

Normal editing therefore isn't constantly paying the tracing cost.

---

# 10. Record/replay

Hit:

```text
● RECORD
```

Use the program.

Stop.

You now have:

```text
0ms                                            912ms
│─────────────────────────────●──────────────────│
                              ▲
```

Move the time cursor.

The spatial graph rewinds.

```text
120ms

SaveButton
    ║
    ▼
handleSubmit
```

Then:

```text
410ms

handleSubmit
    ║
    ▼
updateUser
    ║
    ▼
HTTP request
```

Then:

```text
650ms

HTTP response
    ║
    ▼
UserStore
    ║
    ├══► Header
    └══► Profile
```

I think this becomes one of the signature features.

---

# 11. Performance visualization

Runtime events can accumulate metrics.

```text
                     processOrder
                         15ms
                           │
               ┌───────────┴───────────┐
               ▼                       ▼
          validateOrder             loadUser
              2ms                     81ms
                                       │
                                       ▼
                                  DATABASE
```

Possible visual dimensions:

* execution frequency
* execution duration
* allocation
* rerender count
* network latency
* errors
* exceptions
* CPU hot spots

You could switch:

```text
Architecture
Execution
Performance
Memory
Network
```

without changing the underlying spatial layout.

---

# 12. Data-flow inspection

Opt-in because it's expensive.

Select:

```text
user.email
```

and ask:

> Where did this value come from?

Then:

```text
HTML Input
    ║
    ▼
onChange
    ║
    ▼
formState.email
    ║
    ▼
normalizeEmail()
    ║
    ▼
User.email
    ║
    ▼
JSON
    ║
    ▼
POST /users
```

Potentially showing values at each step.

This would need privacy controls because traces could easily contain passwords, API tokens, personal information, etc.

---

# 13. React-specific runtime adapter

React eventually adds:

```text
DOM
 │
 ▼
React runtime instance
 │
 ▼
component
 │
 ▼
source
```

Then:

```text
         [ Save ]
             │
             ▼
        SaveButton
             │
             ▼
       handleSave()
```

And React-render debugging:

```text
UserContext changed
       │
       ├══► Header       2ms
       ├══► Profile      3ms
       └══► Sidebar     19ms
```

---

# 14. Git + AI change sets

Every significant LLM modification gets an isolated change set.

```text
main
 │
 ├── current
 │
 └── AI worktree
       │
       └── proposed
```

The environment shows:

```text
              BEFORE

          SettingsPage
               │
          ProfileForm


               AFTER

          SettingsPage
           /         \
      Profile       Security
```

And program previews:

```text
[ BEFORE ] ◄────────────► [ AFTER ]
```

Accept:

```text
Apply
```

Reject:

```text
Discard
```

Modify:

> Keep the new form but undo the header change.

---

# 15. LLM spatial context

The model doesn't receive only text.

Its tool API includes things like:

```text
get_selection()
get_nearby_nodes()
get_dependencies()
get_callers()
get_callees()
get_runtime_trace()
get_current_stack()
get_variables()
get_ui_element()
get_recent_changes()
```

You point at a node and say:

> Why is this slow?

That selected object becomes structured prompt context.

---

# 16. Cross-language projects

Eventually this:

```text
React
   │
   │ HTTP
   ▼
ASP.NET
   │
   │ Queue
   ▼
Python Worker
   │
   ▼
Postgres
```

is one graph.

Each language contributes through five optional capabilities:

```rust
LanguageAdapter
SemanticProvider
DebugProvider
RuntimeProvider
FrameworkAdapter
```

Not every language needs all five.

A new language can start with:

```text
Tree-sitter only
```

then gain:

```text
LSP
```

then:

```text
DAP
```

then specialized framework intelligence.

That makes "full language support" realistically mean **a framework where additional languages can be added without modifying the core**, rather than pretending we can understand every programming language perfectly.

---

# 17. Plugin system

Eventually external plugins should be able to contribute:

```text
node kinds
edge kinds
parsers
framework detection
runtime events
graph layouts
preview providers
commands
LLM tools
```

Someone could theoretically write:

```text
Django plugin
Unreal plugin
Kubernetes plugin
SQL plugin
Terraform plugin
```

without changing Spatial Code itself.

---

# 18. End-state feature set

So the big version ultimately has:

```text
✓ spatial source navigation
✓ VR code editing
✓ desktop editing
✓ terminal
✓ app previews
✓ static dependency graph
✓ call graph
✓ architecture graph
✓ LSP
✓ DAP debugger
✓ breakpoints
✓ stepping
✓ variables
✓ watches
✓ continuous execution tracing
✓ record/replay
✓ performance visualization
✓ network tracing
✓ data-flow tracing
✓ React render tracing
✓ Git visualization
✓ AI edits
✓ before/after execution
✓ multi-language projects
✓ framework adapters
✓ persistent spatial layouts
✓ voice interaction
✓ plugin SDK
```

That's the north star.

---

# Plan B — Version 1

V1 should be **dramatically smaller**.

The goal isn't:

> Build a VR IDE.

The goal is:

> **Prove that navigating, editing and running real source code spatially is useful.**

Use a basic TypeScript command-line application.

For example:

```text
example/
├── src/
│   ├── index.ts
│   ├── game.ts
│   ├── input.ts
│   └── random.ts
└── package.json
```

Maybe just a number guessing program.

---

# V1 architecture

Keep the final architecture boundaries:

```text
             React/R3F/WebXR
                   │
                   │ WebSocket
                   ▼
              Rust server
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
    Workspace   TS parser    Process
       │           │           │
       │           ▼           ▼
       │       ProgramGraph    PTY
       │
       ▼
     Files
```

No React-specific logic in the core.

---

# V1.0 — Workspace

First capability:

```text
spatial-code ./example-project
```

Rust:

1. opens workspace
2. reads project
3. watches filesystem
4. detects `.ts` files
5. reports workspace structure

Frontend gets:

```text
src
 ├─ index.ts
 ├─ game.ts
 ├─ input.ts
 └─ random.ts
```

In VR these become physical nodes.

---

# V1.1 — TypeScript graph

Add Tree-sitter TypeScript.

Tree-sitter supports incremental reparsing after edits, which is exactly what we need for maintaining a graph while source is being edited. ([Tree-sitter][3])

Extract only:

```text
File
Function
Class
Import
Export
```

Edges:

```text
contains
imports
calls
```

Nothing more.

Example:

```ts
import { getGuess } from "./input"
import { checkGuess } from "./game"

function main() {
    const guess = getGuess()
    checkGuess(guess)
}
```

becomes:

```text
                  index.ts
                 /        \
                ▼          ▼
           getGuess     checkGuess
               ▲             ▲
               │             │
           input.ts       game.ts
```

That is enough to prove the concept.

---

# V1.2 — Spatial graph

Build:

```tsx
<WorkspaceScene>
    <CodeGraph />
</WorkspaceScene>
```

Interactions:

```text
point
select
grab
move
expand
collapse
focus
back
```

Desktop mouse equivalents should exist for everything.

That matters enormously because you don't want to wear the headset every time you test the graph.

The current R3F UI ecosystem includes `react-three-uikit`, which is specifically intended for 3D/XR interface layouts, so it's a reasonable basis for the panels. ([pmndrs][4])

---

# V1.3 — Source viewer

Select:

```text
checkGuess()
```

and get:

```text
┌───────────────────────────────────┐
│ game.ts                           │
├───────────────────────────────────┤
│                                   │
│ function checkGuess(...) {        │
│     ...                           │
│ }                                 │
│                                   │
└───────────────────────────────────┘
```

The backend tells the frontend:

```text
file
start line
end line
symbol
```

Clicking a graph node opens the corresponding source.

---

# V1.4 — Actual VR editor

This is where I'd deliberately do some real engineering rather than cheat with a read-only panel.

Build a generic:

```tsx
<CodeEditor />
```

with:

```text
cursor
selection
keyboard input
scroll
undo
redo
save
basic syntax highlighting
```

I would strongly consider using a mature editor-state engine underneath while supplying our own R3F renderer.

Conceptually:

```text
Editor state
    │
    ├── text
    ├── cursor
    ├── selection
    ├── history
    └── transactions
           │
           ▼
     custom XR renderer
```

Only visible lines should actually exist as rendered objects:

```text
file = 3,000 lines

VR objects:
lines 120–165
```

not all 3,000.

That virtualization will matter.

V1 doesn't need:

```text
autocomplete
refactoring
diagnostics
multi-cursor
IntelliSense
```

yet.

Just make editing **real**.

---

# V1.5 — Edit → graph synchronization

Now the first magic moment.

Change:

```ts
function checkGuess() {
```

to something involving a new helper:

```ts
function checkGuess() {
    validateGuess()
}
```

Save.

Rust receives the change.

Tree-sitter reparses incrementally. ([Tree-sitter][3])

The graph updates:

```text
BEFORE

checkGuess


AFTER

checkGuess
    │
    ▼
validateGuess
```

without reopening the project.

At this point we have a genuinely live spatial representation of source.

---

# V1.6 — PTY terminal

Implement the terminal **properly now**, because it becomes debugger infrastructure later.

Rust:

```text
TerminalManager
    │
    └── PTY
```

Commands can be:

```bash
pnpm install
pnpm build
pnpm start
node dist/index.js
```

Frontend:

```text
┌──────────────────────────────────────┐
│ Terminal                             │
├──────────────────────────────────────┤
│ $ pnpm start                         │
│                                      │
│ Guess a number:                      │
│                                      │
└──────────────────────────────────────┘
```

Support:

```text
stdout
stderr
stdin
Ctrl+C
resize
scrollback
basic ANSI
```

Using a PTY rather than merely capturing stdout means interactive programs work too.

And later the DAP host can reuse exactly this terminal mechanism. ([Microsoft GitHub][2])

---

# V1.7 — Run configurations

Don't hardcode:

```bash
npm start
```

Create a generic concept now:

```json
{
  "name": "Run",
  "command": "pnpm",
  "args": ["start"],
  "cwd": "."
}
```

Then the UI has:

```text
▶ Run
■ Stop
↻ Restart
```

This immediately works for future projects:

```text
cargo run
python app.py
dotnet run
go run .
```

without changing the process subsystem.

---

# V1.8 — Output associated with execution

When a program runs:

```text
▶ index.ts

index.ts
   │
   ▼
main()
```

show its process nearby:

```text
             main()
                │

        ┌──────────────┐
        │  TERMINAL    │
        │              │
        │ Guess: 42    │
        └──────────────┘
```

This doesn't yet trace which function emitted each line.

It's simply:

```text
program
   ↕
terminal
```

Actual execution tracing comes later.

---

# V1.9 — Basic editing workflow

The complete workflow should now be:

```text
OPEN PROJECT
     │
     ▼
VIEW GRAPH
     │
     ▼
SELECT FUNCTION
     │
     ▼
VIEW CODE
     │
     ▼
EDIT CODE
     │
     ▼
SAVE
     │
     ▼
GRAPH CHANGES
     │
     ▼
RUN
     │
     ▼
VIEW TERMINAL
     │
     ▼
EDIT AGAIN
```

All while remaining inside VR.

If that workflow feels good, you've proven something significant.

---

# V1 non-goals

I'd aggressively exclude:

```text
✗ React understanding
✗ browser preview
✗ LSP
✗ autocomplete
✗ DAP
✗ execution tracing
✗ AI editing
✗ Git visualization
✗ multiple languages
✗ performance profiling
✗ data-flow tracing
```

Not because those aren't important.

Because **none of them are necessary to answer the V1 question**.

---

# What I would put into V1 anyway

There are several abstractions that seem unnecessary but should exist immediately because they'll prevent painful rewrites.

## `LanguageAdapter`

V1:

```text
TypeScriptAdapter
```

Later:

```text
RustAdapter
PythonAdapter
CSharpAdapter
```

---

## `PreviewProvider`

V1:

```text
TerminalPreview
```

Later:

```text
BrowserPreview
DesktopPreview
```

---

## `RuntimeProvider`

V1:

```text
none
```

Later:

```text
ReactRuntime
NodeRuntime
PythonRuntime
```

---

## `DebugProvider`

V1:

```text
none
```

Later:

```text
DAP
```

---

## `ProcessManager`

V1:

```text
pnpm start
```

Later the exact same thing launches:

```text
Vite
debug adapters
test runners
language servers
application previews
```

---

# Repo layout from V1 onward

I'd probably start approximately here:

```text
spatial-code/
│
├── apps/
│   └── xr/
│       ├── src/
│       │   ├── graph/
│       │   ├── editor/
│       │   ├── terminal/
│       │   ├── workspace/
│       │   └── xr/
│       └── package.json
│
├── crates/
│   ├── core/
│   │   ├── workspace/
│   │   ├── source/
│   │   └── protocol/
│   │
│   ├── graph/
│   │
│   ├── languages/
│   │   └── typescript/
│   │
│   ├── processes/
│   │
│   ├── terminal/
│   │
│   └── server/
│
├── examples/
│   └── guessing-game/
│
├── package.json
└── Cargo.toml
```

Later we simply gain:

```text
crates/
├── lsp/
├── dap/
├── tracing/
├── agent/
├── git/
├── previews/
└── frameworks/
```

The existing pieces don't move.

---

# Then React really can be V1.5–2

Once V1 works, React support shouldn't require changing the editor, terminal, graph renderer, project loader, process manager or workspace protocol.

We add:

```text
TypeScript project
        +
ReactFrameworkAdapter
        +
BrowserPreviewProvider
```

First:

```text
Component detection

function SettingsPage() {
    return ...
}
```

becomes:

```text
SettingsPage
```

Then JSX relationships:

```text
SettingsPage
     │ renders
     ├────► ProfileForm
     └────► SaveButton
```

Then Vite integration:

```text
pnpm dev
    │
    ▼
BrowserPreview
```

Then source/UI mapping:

```text
[ Save ]
   │
   ▼
SaveButton.tsx
```

So V1.5/2 becomes additive:

```text
                V1

Files ──► Symbols ──► Graph
  │                   │
  ├── Editor           │
  │                    │
  └── Process ──► Terminal


                V2

Files ──► Symbols ──► Graph
  │          ▲         │
  │          │         │
  │       React        │
  │       Adapter      │
  │                    │
  ├── Editor           │
  │                    │
  └── Vite ─────► Browser Preview
                       │
                       ▼
                  Runtime Graph
```

That's exactly the progression I'd want.

---

# And then V2+ debugger work becomes surprisingly clean

Once we have:

```text
Graph
Editor
Terminal
ProcessManager
SourceLocations
```

we already possess most of the **UI infrastructure of a debugger**.

Adding DAP gives us:

```text
breakpoint
    ↓
source location
    ↓
graph node

stack frame
    ↓
source location
    ↓
graph node

variable
    ↓
debug panel

output
    ↓
existing terminal
```

DAP was explicitly designed around exactly this generic-development-tool/debug-adapter separation. ([Microsoft GitHub][2])

And continuous tracing then becomes another overlay rather than a second application:

```text
                  ProgramGraph
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
   Static view      DAP state        Trace state
                       │                │
                   PAUSED HERE       RAN HERE
```

That is the architecture I would commit to.

**V1's success criterion should be extremely simple:** you put on the headset, open a small TypeScript project, understand its structure spatially, grab a function, edit its real source, save it, see the spatial structure update, run the actual program, and interact with its terminal—without leaving VR.

If that experience is compelling even with a tiny guessing-game project, then adding React isn't a gamble anymore. It's enriching an interaction model that you've already demonstrated works.

[1]: https://microsoft.github.io/language-server-protocol/?utm_source=chatgpt.com "Official page for Language Server Protocol"
[2]: https://microsoft.github.io/debug-adapter-protocol/overview.html?utm_source=chatgpt.com "Overview"
[3]: https://tree-sitter.github.io/tree-sitter/using-parsers/3-advanced-parsing.html?utm_source=chatgpt.com "Advanced Parsing - Tree-sitter"
[4]: https://pmndrs.github.io/uikit/docs/getting-started/introduction?utm_source=chatgpt.com "Introduction - uikit"

