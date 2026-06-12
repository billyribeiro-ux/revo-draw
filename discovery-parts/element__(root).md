## Cluster: element__(root)

### packages/element/global.d.ts

Ambient TypeScript declaration file for the `@excalidraw/element` package that pulls in shared global type/CSS module declarations so the package's source can reference Vite client types and the editor's global ambient types.

- This is a **types-only / ambient-declaration file**. It contains **no functions, classes, methods, hooks, components, or constants**.
- Its entire content (L1-L3) is three module/triple-slash directives:
  - **L1:** `/// <reference types="vite/client" />` — a TypeScript triple-slash directive that brings Vite's client ambient types (e.g. `import.meta.env`, `import.meta.glob`, asset-import module declarations like `*.svg?raw`) into scope for every file in the package.
  - **L2:** `import "@excalidraw/excalidraw/global";` — a side-effect (ambient) import re-using the main editor package's `global.d.ts` declarations so this package sees the same global type augmentations.
  - **L3:** `import "@excalidraw/excalidraw/css";` — a side-effect import of the editor package's CSS module type declarations, allowing `.css`/`.scss` imports to typecheck within this package.
- No exported or internal symbols of any kind; no math, geometry, coordinate-space, or performance-relevant logic. Pure ambient wiring with zero runtime footprint (these directives/imports compile away or only register type declarations).
