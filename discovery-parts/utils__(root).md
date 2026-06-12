## Cluster: utils__(root)

This cluster contains a single file, `packages/utils/global.d.ts`, an ambient TypeScript declaration entrypoint for the `@excalidraw/utils` package.

### packages/utils/global.d.ts

Ambient TypeScript declaration file that pulls in shared global type augmentations and CSS-module typings so that the `@excalidraw/utils` package compiles against the same global environment as the rest of the monorepo.

This file is **types-only / declaration-only**. It contains no functions, classes, React hooks, components, or runtime constants — only directives:

- `/// <reference types="vite/client" />` (L1) — Triple-slash directive bringing in Vite's client ambient types (e.g. `import.meta.env`, `import.meta.hot`, and asset import declarations such as `*.svg`, `*.css?inline`). This makes Vite-specific globals available to the type checker within this package.
- `import "@excalidraw/excalidraw/global";` (L2) — Side-effect import of the main editor package's global ambient declarations, re-exposing whatever globals/`declare global` augmentations that module defines (window/process/env augmentations, etc.) to consumers of `@excalidraw/utils`.
- `import "@excalidraw/excalidraw/css";` (L3) — Side-effect import of the editor package's CSS type declarations, so CSS/stylesheet imports type-check correctly here.

Notes for parity work:
- There are **no exported or internal symbols** to document — nothing here affects runtime geometry, coordinate spaces, or canvas rendering. It exists purely to satisfy the TypeScript compiler for the `utils` package by aligning its global type surface with the editor and Vite.
- No line ranges beyond L1–L3 are relevant; the entire file is three lines.
