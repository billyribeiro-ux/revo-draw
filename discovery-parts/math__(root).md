## Cluster: math__(root)

This cluster contains a single file: `packages/math/global.d.ts`.

### packages/math/global.d.ts

Ambient TypeScript declaration (types/environment-only) file for the `@excalidraw/math` package; it pulls in global type augmentations so that the package's source files compile with the correct ambient types.

- **No functions, classes, methods, React hooks, or significant constants are defined.** The file is purely declarative.
- Contents (L1-L3):
  - L1: `/// <reference types="vite/client" />` — triple-slash directive bringing in Vite's client-side ambient types (e.g. `import.meta.env`, asset import module declarations) so that Vite-specific globals are available during type-checking and build.
  - L2: `import "@excalidraw/excalidraw/global";` — side-effect import pulling in the editor package's global ambient type augmentations.
  - L3: `import "@excalidraw/excalidraw/css";` — side-effect import registering CSS module / `.css` import type declarations.
- No exports, no interfaces or types declared locally; it only re-references/imports external ambient declarations. There is no math, geometry, coordinate-space, or performance logic in this file (despite the package name), so there is nothing of parity significance for a Svelte/Canvas reimplementation.
