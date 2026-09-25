# SC-002: Always-Available Context-Aware Coding Assistant

**Status:** Not started
**Roadmap:** [roadmap.md](../roadmap.md)

## Summary

An always-available coding assistant that is aware of the current context. Tell it to make changes or explain something and it does.

## Details (from design sketch)

- Point at a function to highlight it and add it to the agent's context.
- Git history, blame, and commit details should also be available to the agent (see [SC-009](SC-009-robust-git-support.md)).

## Acceptance Criteria

- [ ] Assistant can be summoned at any time without leaving the VR session.
- [ ] Assistant receives the current selection (file, function, line) as context.
- [ ] Pointing at a function highlights it and adds it to the agent context.
- [ ] Assistant can explain selected code.
- [ ] Assistant can make code changes on request, and the changes show up in the tree.
