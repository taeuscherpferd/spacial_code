# SC-001: Visualize Code Trees in VR

**Status:** Not started
**Roadmap:** [roadmap.md](../roadmap.md)

## Summary

Visualize code trees in VR, covering both the **file structure** and the **logical/calling trees**.

## Details (from design sketch)

- Files are nodes in a spatial graph (e.g. `Home.tsx`, `Header.tsx`, `utils.tsx`, `AppWrap.tsx`, `Details.tsx`).
- Clusters of files are represented as a fluffy gray shape that can be expanded.
- Grabbing a file selects it.
- Selecting a file opens an expanded view listing its contents (components, functions) alongside the code itself.
- Project entry point: a "Select Project" panel with a grid of project icons.

## Acceptance Criteria

- [ ] User can select a project from a "Select Project" panel.
- [ ] File structure tree is rendered in 3D space.
- [ ] Logical/calling tree (imports, function calls) is rendered in 3D space.
- [ ] User can switch between or combine file and logical views.
- [ ] Large groups of files collapse into clusters that can be expanded.
- [ ] Grabbing a file node selects it and opens an expanded view with its symbols and code.
