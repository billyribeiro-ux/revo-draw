## Cluster: excalidraw__subset__0

This cluster is Excalidraw's **font-subsetting pipeline**: given a woff2 font and the set of Unicode codepoints actually used in a drawing, it decompresses the font (woff2 → sfnt/OTF), uses HarfBuzz (compiled to WASM) to strip out unused glyphs, recompresses to woff2, and returns a `data:font/woff2;base64,...` URL. It runs in a Web Worker pool when available, falling back to the main thread. The two `*-wasm.ts` / `woff2-bindings.ts` files are generated artifacts (base64 WASM blob + emscripten glue) and are not hand-maintained.

Parity note for a Svelte/Canvas reimplementation: this subsystem is **not geometry/coordinate-space code** — it is purely binary font-bytes transformation. A reimplementation only needs to reproduce the *contract*: "give me a woff2 buffer + a `Set<number>` of codepoints, get back a subsetted woff2 data URL, transparently using a worker, falling back to the whole font on any error." The exact WASM bindings can be reused verbatim. The only behaviorally subtle parts are: (a) the ArrayBuffer copy/transfer dance to avoid working on a detached buffer, (b) the `shouldUseWorkers` latch that disables workers permanently after the first failure, and (c) base64 encoding being deliberately kept on the main thread to avoid copying large strings across the worker boundary.

---

### packages/excalidraw/subset/harfbuzz/harfbuzz-bindings.ts

Thin TypeScript wrapper around the HarfBuzz WASM `hb-subset` C API that drives a single font-subset operation; adapted from the `subset-font` npm package (browser-only, codepoint-input variant).

- `subset(hbSubsetWasm: any, heapu8: Uint8Array, font: ArrayBuffer, codePoints: ReadonlySet<number>)` → returns `Uint8Array` (subsetted sfnt/OTF bytes) — **L48-L198**.
  - Algorithm / behavior: orchestrates the full HarfBuzz subset call sequence:
    1. `hb_subset_input_create_or_fail()` — allocates a subset-input config; throws if it returns `0` (null pointer) (**L54-L59**).
    2. `malloc(font.byteLength)` then `heapu8.set(new Uint8Array(font), fontBuffer)` — copies the JS font bytes into the WASM linear heap at offset `fontBuffer` (**L61-L62**).
    3. `hb_blob_create(fontBuffer, byteLength, 2 /* HB_MEMORY_MODE_WRITABLE */, 0, 0)` → `hb_face_create(blob, 0)` → `hb_blob_destroy(blob)` — wraps the heap bytes as a HB blob, builds a face, releases the blob (**L65-L73**).
    4. Layout-feature handling = "keep all features": `hb_subset_input_set(input, 6 /* HB_SUBSET_SETS_LAYOUT_FEATURE_TAG */)`, then `hb_set_clear` + `hb_set_invert` so the set contains *every* feature tag (the equivalent of `--font-features=*`) (**L76-L81**).
    5. Unicode selection: `hb_subset_input_unicode_set(input)` then a loop adding every codepoint via `hb_set_add(inputUnicodes, c)` (**L101-L104**).
    6. `hb_subset_or_fail(face, input)` inside a `try/finally` that always calls `hb_subset_input_destroy(input)`; on `0` result it destroys the face, frees `fontBuffer`, and throws "maybe the input file is corrupted" (**L157-L170**).
    7. Result extraction: `hb_face_reference_blob(subset)` → `hb_blob_get_data(result, 0)` gives a heap **offset**, `hb_blob_get_length(result)` gives the byte length; a zero length triggers full cleanup + throw (**L173-L185**).
    8. Copies the result out of the WASM heap with `new Uint8Array(heapu8.subarray(offset, offset + subsetByteLength))` — a **copy**, so it survives later heap mutation/free (**L187-L189**).
    9. Cleanup: `hb_blob_destroy(result)`, `hb_face_destroy(subset)`, `hb_face_destroy(face)`, `free(fontBuffer)` (**L191-L195**).
  - Notable inputs/outputs & invariants: `heapu8` must be a live view onto `hbSubsetWasm.memory.buffer`; all interop uses **integer heap offsets**, not JS objects. Manual memory management — every `create`/`malloc`/`reference_blob` is paired with a `destroy`/`free` on every code path (success and the early-throw paths). The returned `Uint8Array` is intentionally a fresh allocation (subarray-into-new) so freeing the WASM buffer afterward is safe. Side effects: mutates the WASM linear heap.
  - Large commented-out blocks (**L42-L46**, **L83-L98**, **L106-L155**) document removed upstream features (`HB_TAG` helper, `preserveNameIds`, `noLayoutClosure`, variation-axis pinning/ranging) — not active code.
- `export default { subset }` — **L200-L202**. Module exposes only the `subset` function.

Magic-constant parity note: the integers `6` (`HB_SUBSET_SETS_LAYOUT_FEATURE_TAG`) and `2` (`HB_MEMORY_MODE_WRITABLE`) are HarfBuzz enum values hardcoded here; any reimplementation must use the same values.

---

### packages/excalidraw/subset/harfbuzz/harfbuzz-loader.ts

Lazily instantiates the HarfBuzz WASM module once and returns a memoized `{ subset }` API bound to that instance's heap.

- `load(): Promise<{ subset(fontBuffer: ArrayBuffer, codePoints: ReadonlySet<number>): Uint8Array<ArrayBuffer> }>` (module-private) — **L19-L48**.
  - Behavior: `await WebAssembly.instantiate(binary)` (where `binary` is the imported decoded WASM bytes from `harfbuzz-wasm`), reads `module.instance.exports` as `harfbuzzJsWasm`, builds `heapu8 = new Uint8Array(harfbuzzJsWasm.memory.buffer)`, and returns an object whose `subset` delegates to `bindings.subset(harfbuzzJsWasm, heapu8, fontBuffer, codePoints)` (**L27-L41**). Wrapped in `new Promise(async ...)` with `try/catch → reject` (**L25-L47**).
  - Invariant/perf: `heapu8` is captured **once** at instantiation. The `@ts-expect-error` on **L29** acknowledges `.memory.buffer` is an untyped custom WASM export.
- `loadedWasm: ReturnType<typeof load> | null` (module-level cache, **L16**) — holds the single in-flight/resolved load promise.
- `export default (): ReturnType<typeof load>` — **L51-L57**. Idempotent accessor: if `loadedWasm` is null it calls `load()` and caches the promise, otherwise returns the cached promise. Ensures the WASM module is instantiated at most once per module scope.
- File-header comment (**L1-L8**) is a hard rule: this chunk must not import from the main chunk, or the whole main chunk gets pulled into the lazy chunk (no tree-shaking in dev).

---

### packages/excalidraw/subset/harfbuzz/harfbuzz-wasm.ts

Generated artifact: the HarfBuzz `hb-subset` WASM binary embedded as a base64 string plus a fast base64→`Uint8Array` decoder; default-exports the decoded bytes ready for `WebAssembly.instantiate`. 57 lines total (the binary is a single very long base64 literal).

- Header (**L1-L37**): `// GENERATED CODE -- DO NOT EDIT!`, `/* eslint-disable */`, `// @ts-nocheck`. Documents provenance: built by `scripts/buildWasm.js` from the `harfbuzzjs` package (author Ebrahim Byagowi, MIT, v0.3.6).
- `__toBinary` (IIFE-produced decoder, **L40-L55**): builds a 128-entry lookup `table` mapping base64 ASCII char codes to 6-bit values via the expression `i < 26 ? i + 65 : i < 52 ? i + 71 : i < 62 ? i - 4 : i * 4 - 205` (covers `A–Z`, `a–z`, `0–9`, `+`, `/`). The returned closure computes output length accounting for `=` padding (`(n - (last=='=') - (secondLast=='=')) * 3/4 | 0`) and decodes 4 chars → 3 bytes per iteration with the classic `c0<<2|c1>>4`, `c1<<4|c2>>2`, `c2<<6|c3` shifts (**L46-L52**). This is the esbuild "faster atob alternative" pattern referenced at **L39**.
- Default export (not shown in the partial read but implied by the loader's `import binary from "./harfbuzz-wasm"`): the decoded WASM `Uint8Array` produced by applying `__toBinary` to the embedded base64 constant. **Types-only/generated** — no hand-authored logic beyond the decoder.

---

### packages/excalidraw/subset/subset-main.ts

Public entry point of the subset pipeline: orchestrates worker-pool vs. main-thread subsetting and returns the font as a base64 data URL.

- `subsetWoff2GlyphsByCodepoints(arrayBuffer: ArrayBuffer, codePoints: Array<number>): Promise<string>` (exported) — **L21-L72**.
  - Behavior: lazy-loads the shared chunk to get `{ Commands, subsetToBase64, toBase64 }` (**L25-L26**). If `shouldUseWorkers` is false, immediately runs `subsetToBase64` on the main thread (**L28-L30**). Otherwise, inside `promiseTry`: gets/creates the worker pool, **copies** the buffer via `arrayBuffer.slice(0)` (comment **L35-L36**: prevents operating on a detached buffer if the worker throws — a transferred buffer isn't auto-reattached on worker termination), posts `{ command: Commands.Subset, arrayBuffer: arrayBufferCopy, codePoints }` with `{ transfer: [arrayBufferCopy] }`, then encodes the returned `ArrayBuffer` to base64 **on the main thread** via `toBase64(result)` (**L38-L48**, comment L47 explains this avoids copying large data-url strings across threads).
  - Error handling: on any failure it sets `shouldUseWorkers = false` (permanent latch — workers are never retried this session, **L51**), conditionally suppresses logging for expected server-side errors (`isServerEnv()` && (`WorkerUrlNotDefinedError` || `WorkerInTheMainChunkError`)) (**L53-L66**), then falls back to `subsetToBase64(arrayBuffer, codePoints)` on the main thread using the **original** (un-transferred, hence still-valid) buffer (**L69**).
  - Outputs/invariants: returns a `data:font/woff2;base64,...` string; never throws to the caller (always falls back to encoding the whole/subset font). Note the codepoints cross the thread boundary as a plain `Array<number>` (cloned), not transferred.
- `shouldUseWorkers: boolean` (module state, **L8**): initialized to `typeof Worker !== "undefined"`; flipped to false on first worker failure.
- `subsetWorker: Promise<typeof import("./subset-worker.chunk")> | null` (**L75**) and `lazyLoadWorkerSubsetChunk()` (**L78-L84**): memoized dynamic import of the worker chunk (which exposes the `WorkerUrl`).
- `subsetShared: Promise<typeof import("./subset-shared.chunk")> | null` (**L76**) and `lazyLoadSharedSubsetChunk()` (**L86-L93**): memoized dynamic import of the shared chunk; comment L87-L88 stresses that dynamic import is what forces it into a *shared* chunk reused by both threads.
- Types: `SubsetWorkerData` = `{ command: typeof Commands.Subset; arrayBuffer: ArrayBuffer; codePoints: Array<number> }` (**L96-L100**); `SubsetWorkerResult<T>` conditional = `ArrayBuffer` when command is `Subset`, else `never` (**L102-L103**).
- `workerPool: Promise<WorkerPool<...>> | null` (**L105-L107**) and `getOrCreateWorkerPool()` (**L114-L130**): singleton creation. Uses `promiseTry` to assign the promise *synchronously* (comment L116) so concurrent callers share one pool; inside it awaits `lazyLoadWorkerSubsetChunk()` for `WorkerUrl` and calls `WorkerPool.create(WorkerUrl)`. `@throws` implicitly if pool/wasm/worker init fails.

Perf detail for parity: the two-step "subset in worker returns ArrayBuffer, base64-encode on main thread" split is a deliberate optimization — base64 of a font is a large string and is cheaper to produce once on the main thread than to serialize across `postMessage`.

---

### packages/excalidraw/subset/subset-shared.chunk.ts

Isomorphic (main-thread / worker / node / jsdom) core that performs the actual decompress→subset→compress and base64 conversion; deliberately self-contained (no main-chunk imports).

- `subsetToBase64(arrayBuffer: ArrayBuffer, codePoints: Array<number>): Promise<string>` (exported) — **L25-L37**.
  - Behavior: `await subsetToBinary(...)` then `toBase64(buffer)`; on **any** thrown error it `console.error("Skipped glyph subsetting", e)` and falls back to `toBase64(arrayBuffer)` — i.e. encode the *whole, unsubsetted* font (**L29-L36**). Output: woff2 base64 data URL. Invariant: never throws; degrades gracefully to the full font.
- `subsetToBinary(arrayBuffer: ArrayBuffer, codePoints: Array<number>): Promise<ArrayBuffer>` (exported) — **L44-L58**.
  - Behavior: lazy-loads `{ compress, decompress }` from `loadWoff2()` and `{ subset }` from `loadHbSubset()` (**L50-L51**). Pipeline: `decompress(arrayBuffer).buffer` → sfnt bytes (**L53**); `subset(decompressedBinary, new Set(codePoints))` → subsetted sfnt `Uint8Array` (**L54**); `compress(snftSubset.buffer)` → woff2 `Uint8Array`; returns `compressedBinary.buffer` (the underlying `ArrayBuffer`) (**L55-L57**).
  - Notable: the array→`Set` conversion happens here (dedup of codepoints); `.buffer` access assumes each WASM result is a `Uint8Array` over a standalone `ArrayBuffer`. Comment L48-L49 warns wasm init is expensive and each worker instance loads its own copy into its own memory — keep the worker count small. Side effects: instantiates two WASM modules (memoized inside their loaders).
- `toBase64(arrayBuffer: ArrayBuffer): Promise<string>` (exported) — **L65-L81**.
  - Behavior: if `Buffer` exists (node/jsdom) uses `Buffer.from(arrayBuffer).toString("base64")`; otherwise (browser) builds a byte string via `String.fromCharCode(...new Uint8Array(arrayBuffer))` then `btoa(...)` (**L68-L78**). Returns `data:font/woff2;base64,${base64}`. Comment L73-L75 justifies the per-byte treatment (we only need raw bytes → base64, not multi-byte Unicode semantics).
  - Perf caveat for parity: `String.fromCharCode(...new Uint8Array(...))` spreads every byte as an argument — fine for fonts but a potential call-stack risk for very large buffers; the reimplementation may prefer a chunked loop.
- `Commands = { Subset: "SUBSET" } as const` (exported, **L16-L18**): the worker message-command enum, shared so main/worker agree on the literal.
- File-header comment (**L1-L8**): same "no main-chunk imports" rule as the loaders.

---

### packages/excalidraw/subset/subset-worker.chunk.ts

The Web Worker entry chunk: exports its own URL so the bundler emits it as a separate chunk, and wires `onmessage` to run the shared subset routine.

- `WorkerUrl: URL | undefined` (exported, **L18-L20**): `import.meta.url ? new URL(import.meta.url) : undefined`. Comment L13-L17: the export + dynamic import is what causes bundlers (esbuild/vite/rollup) to emit this file as a standalone worker chunk without plugins; `import.meta.url` is `undefined` in Node (hence the guard → leads to `WorkerUrlNotDefinedError` upstream).
- `self.onmessage` handler (**L23-L42**): guarded by `typeof window === "undefined" && typeof self !== "undefined"` so it only registers in a true worker context. On a `Commands.Subset` message it `await subsetToBinary(e.data.arrayBuffer, e.data.codePoints)` and replies `self.postMessage(buffer, { transfer: [buffer] })` — transferring the result `ArrayBuffer` back (zero-copy) (**L31-L40**). Message `data` type mirrors `SubsetWorkerData`. Side effect: registers a global worker message listener.

---

### packages/excalidraw/subset/woff2/woff2-bindings.ts

Generated artifact (4052 lines): an emscripten-compiled woff2 codec module (`fonteditor-core`'s `woff2.js`) providing `compress`/`decompress` of font binaries via WASM. `/* eslint-disable */` + `// @ts-nocheck`. **Not hand-maintained**; default-exports the emscripten `Module` factory. The two upstream modifications (header **L4-L9**): (1) replaced original exports with `export default Module;`, and (2) replaced `instanceof ArrayBuffer` with `Object.prototype.toString.call(d) === "[object ArrayBuffer]"` for cross-VM reliability.

This is standard emscripten glue; the runtime-significant internals (cited for completeness, not application logic):

- `Module` IIFE factory (**L33-L4047**): closure returning `function (Module) { ... return Module; }`. Detects environment (`ENVIRONMENT_IS_WEB/WORKER/NODE/SHELL`, **L56-L70**), sets up `read_/readAsync/readBinary` per environment (**L83-L211**).
- WASM/heap plumbing: `wasmTable` (`WebAssembly.Table`, initial/max 352, **L371-L375**); `updateGlobalBufferAndViews(buf)` rebuilds typed-array views `HEAP8/HEAPU8/HEAP16/HEAPU16/HEAP32/HEAPU32/HEAPF32/HEAPF64` over the WASM memory buffer (**L599-L609**); fixed memory layout constants `STACK_BASE=434112`, `STACK_MAX=5676992`, `DYNAMIC_BASE=5676992`, `DYNAMICTOP_PTR=433920`, `TOTAL_STACK=5242880`, `INITIAL_TOTAL_MEMORY` default `16777216` (**L610-L623**).
- String marshalling helpers: `UTF8ArrayToString`/`UTF8ToString` (**L448-L495**), `stringToUTF8Array`/`stringToUTF8`/`lengthBytesUTF8` (**L496-L571**) — standard UTF-8 ↔ heap conversion.
- C-call bridges: `ccall(ident, returnType, argTypes, args, opts)` (**L391-L440**) and `cwrap(ident, returnType, argTypes, opts)` (**L441-L445**) — the mechanism by which the **`woff2-loader` builds `compress`/`decompress`** (those wrappers are created in the loader file, not here; this file only exposes `Module.cwrap`/`Module.ccall`, set at **L407-L408**).
- WASI/syscall stubs: `_fd_close`/`_fd_seek`/`_fd_write` (+ `___wasi_*` shims) all effectively no-op/abort since there is no filesystem (**L1229-L1296**); `SYSCALLS` buffer-based `printChar` for stdout/stderr emulation (**L1193-L1228**).
- Embind machinery: `registerType`, `whenDependentTypesAreResolved`, `__embind_register_bool`, `ClassHandle_*` (clone/delete/isAliasOf/finalizer) etc. (**L1383-~L2900**) — C++ ↔ JS class binding support used by the woff2 C++ code.
- `asmLibraryArg` (**L3047**): the import object of JS functions provided to the WASM instance; `asm = Module.asm(asmGlobalArg, asmLibraryArg, buffer)` (**L3099**) wires exports; many `dynCall_*` trampolines (e.g. `dynCall_viiiiii`, **L3381-L3391**) dispatch indirect WASM calls.
- `run(args)` (**L3946-L3987**): emscripten bootstrap — waits on `runDependencies`, runs `preRun`→`initRuntime`→`preMain`→`onRuntimeInitialized`→`postRun` (`doRun` at **L3956-L3974**); `noExitRuntime = true; run();` is invoked at module load (**L4042-L4043**).
- `export default Module;` (**L4049**): exports the factory the `woff2-loader` instantiates to obtain the codec; the actual `compress`/`decompress` functions are `cwrap`-ed by the loader (in cluster `excalidraw__subset__1`), so they do not appear as named functions in this file.

---

_Summary: 7 files. Two are generated WASM/emscripten artifacts (`harfbuzz-wasm.ts`, `woff2/woff2-bindings.ts`) documented at the structural level; the five hand-authored TS files implement the lazy-loaded, worker-pooled, fail-safe font-subsetting pipeline._
