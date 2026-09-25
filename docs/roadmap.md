# Spatial Code Roadmap

With A.I., coding has fundamentally changed, and our tooling needs to change with it. This is a plan to make a coding/code review tool built for the modern age, using all modern technologies.

Original design sketch: [spacial_code_design.jpg](spacial_code_design.jpg)

## Features

| Ticket | Feature | Status |
| --- | --- | --- |
| [SC-001](tickets/SC-001-vr-code-trees.md) | Visualize code trees in VR (file structure and logical/calling trees) | Not started |
| [SC-002](tickets/SC-002-context-aware-assistant.md) | Always-available, context-aware coding assistant | Not started |
| [SC-003](tickets/SC-003-highlight-code-connections.md) | Select a line or function and highlight everything it touches | Not started |
| [SC-004](tickets/SC-004-compare-master-running.md) | Pull up master and compare it running side by side | Not started |
| [SC-005](tickets/SC-005-interactive-app-windows.md) | Fully interactive running app windows | Not started |
| [SC-006](tickets/SC-006-ui-element-to-code.md) | Select a UI element to see connected code | Not started |
| [SC-007](tickets/SC-007-master-vs-changeset-trees.md) | Master and change-set code trees side by side | Not started |
| [SC-008](tickets/SC-008-pr-comments-sync.md) | Code comments synced to PRs in Azure DevOps and Git | Not started |
| [SC-009](tickets/SC-009-robust-git-support.md) | Robust Git support: history, commit details, blame, time travel | Not started |
| [SC-010](tickets/SC-010-place-windows-anywhere.md) | Place windows anywhere | Not started |

## Sketch Notes

**Project selection**
- A user standing in front of a **"Select Project"** panel with a grid of project icons.

**Code tree (file graph)**
- Nodes: `Home.tsx`, `Header.tsx`, `utils.tsx`, `AppWrap.tsx`, `Details.tsx`, plus a "files" node and a "Modify" label.
- A cluster of files is shown as a fluffy gray shape.
- Grabbing a file selects it.

**Expanded file view**
- A panel for `AppWrap.tsx` that lists its contents: component, function, function.
- A large window labeled "The code" with an "Index" label.

**Controller mapping (right controller)**
- Button: **Toggle debugging window**
- Trigger: **Select**
- Grip: **Grab**

**Debugging window**
- **Show App:** ☑ Main ☑ Current

**Agent interaction**
- Point at a function to highlight it for agent context.
