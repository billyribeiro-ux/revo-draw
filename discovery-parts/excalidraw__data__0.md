## Cluster: excalidraw__data__0

### packages/excalidraw/data/ai/types.ts

Types-only file declaring the OpenAI Chat Completions request/response shapes used by Excalidraw's AI (text/wireframe-to-code) integration; no runtime code, no functions.

- `namespace OpenAIInput` — wrapper namespace for request-side types (L1-L189).
  - `type ChatCompletionContentPart` (internal) — union of text and image content parts (L2-L4).
  - `interface ChatCompletionContentPartImage` (internal) — `{ image_url: ChatCompletionContentPartImage.ImageURL; type: "image_url" }` (L6-L13).
  - `namespace ChatCompletionContentPartImage` → `export interface ImageURL` — `{ url: string; detail?: "auto" | "low" | "high" }`; `url` is a URL or base64-encoded image data (L15-L27).
  - `interface ChatCompletionContentPartText` (internal) — `{ text: string; type: "text" }` (L29-L39).
  - `interface ChatCompletionUserMessageParam` (internal) — `{ content: string | Array<ChatCompletionContentPart> | null; role: "user" }` (L41-L51).
  - `interface ChatCompletionSystemMessageParam` (internal) — `{ content: string | null; role: "system" }` (L53-L63).
  - `export interface ChatCompletionCreateParamsBase` — the full request param shape: `messages` (array of user/system params), `model` (string union incl. `gpt-4-vision-preview`, `gpt-4`, etc., with `(string & {})` open-string trick), plus optional `frequency_penalty`, `logit_bias`, `max_tokens`, `n`, `presence_penalty`, `seed`, `stop`, `stream`, `temperature`, `top_p`, `user` (L65-L188).
- `namespace OpenAIOutput` — wrapper namespace for response-side types (L191-L300).
  - `export interface ChatCompletion` — `{ id; choices: Array<Choice>; created: number; model: string; object: "chat.completion"; system_fingerprint?: string; usage?: CompletionUsage }` (L192-L231).
  - `export interface Choice` — `{ finish_reason: "stop"|"length"|"tool_calls"|"content_filter"|"function_call"; index: number; message: ChatCompletionMessage }` (L232-L257).
  - `interface ChatCompletionMessage` (internal) — `{ content: string | null; role: "assistant" }` (L259-L269).
  - `interface CompletionUsage` (internal) — `{ completion_tokens; prompt_tokens; total_tokens }` (L271-L289).
  - `export interface APIError` — readonly error shape: `status` (specific HTTP codes union or undefined), `headers?: Headers`, `error?: { message }`, `code`, `param`, `type` (L291-L299).

Non-obvious detail: the `(string & {})` member in the `model` union is the standard TS trick to preserve literal autocompletion while still accepting arbitrary strings.

### packages/excalidraw/data/blob.ts

Blob/File ingestion, MIME detection, image resizing, and DataURL/File interconversion utilities for loading scenes/libraries and handling image elements.

- `parseFileContents = async (blob: Blob | File): Promise<string>` (internal) — extracts scene JSON text from a blob; PNG → lazily imports `./image` and calls `decodePngMetadata`, SVG → `decodeSvgBase64Payload`, else reads text via `blob.text()` or a `FileReader` fallback (L32-L80). Side effects: dynamic import of `./image`; throws `ImageSceneDataError` (`IMAGE_NOT_CONTAINS_SCENE_DATA`) on missing embedded scene. Note: the `"text" in Blob` check is a (questionable) feature-detect against the `Blob` constructor rather than the instance.
- `export const getMimeType = (blob: Blob | string): string` — returns MIME type from a blob's `.type`/`.name` or from a filename string by extension regex (.excalidraw/.json→json, .png, .jpe?g→jpg, .svg, .excalidrawlib); empty string if unknown (L82-L104).
- `export const getFileHandleType = (handle: FileSystemFileHandle | null)` — returns the matched extension (`json|excalidraw|png|svg`) from the handle name, or null (L106-L112).
- `export const isImageFileHandleType = (type: string | null): type is "png" | "svg"` — type guard, true for png/svg (L114-L118).
- `export const isImageFileHandle = (handle: FileSystemFileHandle | null): handle is FileSystemFileHandle` — derives type via `getFileHandleType` and returns true for png/svg (L120-L125).
- `export const isSupportedImageFileType = (type: string | null | undefined)` — true if `type` is in `IMAGE_MIME_TYPES` values (L127-L129).
- `export const isSupportedImageFile = (blob): blob is Blob & {...}` — type guard checking `blob.type` via `isSupportedImageFileType` (L131-L136).
- `export const loadSceneOrLibraryFromBlob = async (blob, localAppState, localElements, fileHandle?)` — parses contents, `JSON.parse`, then dispatches: valid Excalidraw data → restores elements/appState/files (repairBindings + deleteInvisibleElements, computes scroll center, merges fileHandle precedence `fileHandle || blob.handle || null`); valid library → returns library; else throws "invalid file" (L138-L195). Side effects: re-throws `ImageSceneDataError` distinctly; wraps other errors as generic "invalid file".
- `export const loadFromBlob = async (blob, localAppState, localElements, fileHandle?)` — thin wrapper over `loadSceneOrLibraryFromBlob` that rejects anything not of type `excalidraw` (L197-L215).
- `export const parseLibraryJSON = (json: string, defaultStatus = "unpublished")` — parses library JSON, validates via `isValidLibrary`, supports both `libraryItems` and legacy `library` keys, restores via `restoreLibraryItems` (L217-L227).
- `export const loadLibraryFromBlob = async (blob, defaultStatus = "unpublished")` — `parseLibraryJSON(await parseFileContents(blob), ...)` (L229-L234).
- `export const canvasToBlob = async (canvas: HTMLCanvasElement | Promise<HTMLCanvasElement>): Promise<Blob>` — awaits a possibly-promised canvas, calls `canvas.toBlob`, rejects with `CanvasError("CANVAS_POSSIBLY_TOO_BIG")` if null (L236-L256).
- `export const generateIdFromFile = async (file: File): Promise<FileId>` — computes a **SHA-1** digest of the file bytes via `crypto.subtle.digest`, returns it as hex (`bytesToHexString`); on failure falls back to `nanoid(40)` (40 chars to match SHA-1's 160-bit/40-hex length) (L258-L272). Crypto detail: SHA-1 used purely as a content-addressed file id, not for security.
- `export const getDataURL = async (file: Blob | File): Promise<DataURL>` — `FileReader.readAsDataURL` wrapped in a Promise (L274-L285).
- `export const getDataURL_sync = (data, mimeType): DataURL` — builds `data:<mime>;base64,...` synchronously via `stringToBase64(toByteString(data), true)` (L287-L295). Encoding detail: passes `isByteString=true` to avoid re-encoding.
- `export const dataURLToFile = (dataURL: DataURL, filename = "")` — splits on first comma, `atob`s the payload into a `Uint8Array` char-by-char, parses the mime out of the prefix, returns a `File` (L297-L308).
- `export const dataURLToString = (dataURL: DataURL)` — `base64ToString` of the part after the comma (L310-L312).
- `getImageFileDimensions = async (file: File)` (internal) — measures image `width`/`height` by loading into an `Image()`, preferring `createObjectURL` (with `revokeObjectURL` cleanup) and falling back to `getDataURL`; resolves `naturalWidth||width` (L314-L354). Side effects: creates/revokes object URLs; nulls handlers in `cleanup`.
- `export const resizeImageFile = async (file, opts: { outputType?; maxWidthOrHeight }): Promise<File>` — returns SVGs unchanged; rejects unsupported types; short-circuits if already within bounds and no type change; otherwise lazily imports `pica` + `image-blob-reduce` and downsizes (L356-L413). Non-obvious: `pica({ features: ["js","wasm"] })` deliberately excludes WebWorkers (CRA minification breaks pica in workers); overrides `reduce._create_blob` to force `outputType` at quality 0.8.
- `export const SVGStringToFile = (SVGString: string, filename = "")` — wraps a TextEncoder-encoded SVG string into a typed `File` with svg mime (L415-L419).
- `export const ImageURLToFile = async (imageUrl, filename = ""): Promise<File | undefined>` — `fetch`es a URL, validates ok + supported image type, returns a `File`; throws with `cause: "FETCH_ERROR"` or `"UNSUPPORTED"` (L421-L444).
- `export const getFileHandle = async (event): Promise<FileSystemFileHandle | null>` — if native FS supported, calls `getAsFileSystemHandle()` on the drag/transfer item; returns null on error (warns) or when unsupported (L446-L466).
- `getActualMimeTypeFromImage = async (file: Blob | File)` (internal) — sniffs the **leading bytes** (first 15) of an image and regex-matches magic numbers for png (`137 80 78 71 13 10 26 10`), jpg (`255 216 255`), gif (`71 73 70 56 57 97`), webp (RIFF...WEBP pattern); falls back to `file.type` (L468-L502). Crypto/encoding detail: byte signatures expressed as space-joined decimal byte strings.
- `export const createFile = (blob, mimeType, name)` — `new File([blob], name||"", { type: mimeType })` (L504-L512).
- `normalizedFileSymbol = Symbol("fileNormalized")` (internal const) — marker symbol to prevent double-normalization (L514).
- `export const normalizeFile = async (file: File)` — corrects a file's mime: `.excalidrawlib`/`.excalidraw` by extension, else for images re-detects via `getActualMimeTypeFromImage` and rebuilds the File if mismatched; tags the file with `normalizedFileSymbol` to memoize (L516-L542). Invariant: idempotent via the symbol; does not handle missing .excalidraw extension.
- `export const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer>` — prefers `blob.arrayBuffer()`, falls back to `FileReader.readAsArrayBuffer` (Safari) (L544-L559).

### packages/excalidraw/data/EditorLocalStorage.ts

A static-method wrapper class around `window.localStorage` that JSON-serializes values and swallows/warns on storage errors.

- `export class EditorLocalStorage` — namespace class, never instantiated (L5-L52).
  - `static has(key)` — returns `!!localStorage.getItem(key)`; returns false and warns on error (L6-L13).
  - `static get<T extends JSONValue>(key)` — `JSON.parse`s the stored value typed as `T`, returns null if absent or on error (warns) (L15-L28).
  - `static set = (key, value: JSONValue) => boolean` — `JSON.stringify` + `setItem`, returns true on success / false on error (warns) (L30-L41). Defined as a static arrow-function property.
  - `static delete = (name) => void` — `removeItem`, warns on error (L43-L51). Static arrow-function property.

Non-obvious detail: keys are constrained to the `EDITOR_LS_KEYS` union; `set`/`delete` are class fields (arrow fns), `has`/`get` are methods — a stylistic inconsistency but functionally equivalent here.

### packages/excalidraw/data/encode.ts

Byte-string / base64 / base64url conversion plus the zlib (pako) text `encode`/`decode` codec and the binary `compressData`/`decompressData` container format (chunked buffers + AES-GCM encryption).

- `export const toByteString = (data: string | Uint8Array | ArrayBuffer)` — converts input to a Latin-1 "byte string" (one char per byte) via `String.fromCharCode` per byte; encodes strings with `TextEncoder` first (L14-L26). Note comment: V8 chunked-spread `fromCharCode` would be faster for large buffers.
- `byteStringToArrayBuffer = (byteString: string)` (internal) — copies `charCodeAt` per char into a fresh `Uint8Array`/`ArrayBuffer` (L28-L35).
- `byteStringToString = (byteString: string)` (internal) — UTF-8 decodes a byte string via `TextDecoder` (L37-L39).
- `export const stringToBase64 = (str, isByteString = false)` — `btoa`; if not already a byte string, runs `toByteString` first to be UTF-8-safe (L49-L51).
- `export const base64ToString = (base64, isByteString = false)` — `atob`, then UTF-8 decode unless `isByteString` (comment "async to align" is stale — it's sync) (L54-L58).
- `export const base64ToArrayBuffer = (base64): ArrayBuffer` — uses Node `Buffer.from(base64,"base64").buffer` when available, else browser `atob` → `byteStringToArrayBuffer` (L60-L67). Encoding detail: environment-branched.
- `export const base64urlToString = (str)` — normalizes base64url to base64 (`-`→`+`, `_`→`/`, pads `=` to a multiple of 4) then `atob` (L73-L81).
- `type EncodedData` (internal) — `{ encoded: string; encoding: "bstring"; compressed: boolean; version?: string }` (L87-L94).
- `export const encode = ({ text, compress }): EncodedData` — optionally `deflate`s (pako zlib) the text into a byte string; on deflate failure logs and falls back to uncompressed byte string; always tags `version: "1"`, `encoding: "bstring"` (L99-L121).
- `export const decode = (data: EncodedData): string` — for `"bstring"`: if compressed keeps raw bytes else UTF-8 decodes; then if compressed `inflate`s to string; throws on unknown encoding (L123-L144). Invariant: avoids double-decoding compressed byte strings.
- `type FileEncodingInfo` (internal) — `{ version: 1 | 2; compression: "pako@1" | null; encryption: "AES-GCM" | null }`; v2 is the shipped image-support version, v1 was a pre-release PR version (L150-L158).
- `CONCAT_BUFFERS_VERSION = 1` (internal const) — container format version (L161).
- `VERSION_DATAVIEW_BYTES = 4`, `NEXT_CHUNK_SIZE_DATAVIEW_BYTES = 4` (internal consts) — fixed byte widths for the version header and per-chunk length prefix; comment warns they must never change (backwards-incompat) (L167-L168).
- `DATA_VIEW_BITS_MAP = { 1: 8, 2: 16, 4: 32 }` (internal const) — maps byte-count to DataView bit width (L171).
- `function dataView(...)` (internal, overloaded) — getter overload `(buffer, bytes, offset): number` (L174) and setter overload `(buffer, bytes, offset, value): Uint8Array` (L176-L181); impl at L189-L207 dispatches to `setUintN`/`getUintN`. Throws if a set value exceeds `2^bits - 1`. Invariant: endian-agnostic typed accessor to keep encode/decode in sync across refactors.
- `concatBuffers = (...buffers: Uint8Array[]): Uint8Array<ArrayBuffer>` (internal) — packs `[VERSION(4B)][LEN(4B)+DATA]...` into one buffer; first 4 bytes encode `CONCAT_BUFFERS_VERSION` (L225-L252). Invariant: each chunk ≤ 2^32 bytes (~4GB).
- `splitBuffers = (concatenatedBuffer: Uint8Array)` (internal) — inverse of `concatBuffers`; reads version (throws if `> CONCAT_BUFFERS_VERSION`), then loops reading length-prefixed chunks until buffer end (L254-L291). Subtle: it reads the version using `NEXT_CHUNK_SIZE_DATAVIEW_BYTES` width then advances cursor by `VERSION_DATAVIEW_BYTES` (both are 4, so coincidentally correct).
- `_encryptAndCompress = async (data, encryptionKey)` (private) — `deflate`s data then `encryptData` (AES-GCM); returns `{ iv, buffer }` (L296-L307).
- `export const compressData = async <T>(dataBuffer, options: { encryptionKey } & metadata)` — builds the on-disk encrypted-file format: `concatBuffers(encodingMetadataBuffer, iv, encryptedBuffer)` where the encrypted payload is `concatBuffers(contentsMetadataBuffer, dataBuffer)`; `encodingMetadata` = `FileEncodingInfo{version:2, compression:"pako@1", encryption:"AES-GCM"}` as JSON (L322-L354). Crypto detail: metadata is in cleartext; only contents+contentsMetadata are deflated then encrypted.
- `_decryptAndDecompress = async (iv, decryptedBuffer, decryptionKey, isCompressed)` (private) — `decryptData` then conditional `inflate` (L356-L372).
- `export const decompressData = async <T>(bufferView, options: { decryptionKey })` — splits outer buffer into `[encodingMetadata, iv, buffer]`, parses cleartext encoding metadata, decrypts+inflates, splits inner into `[contentsMetadata, contents]`, returns `{ metadata: T (JSON-decoded), data: contentsBuffer (caller decodes) }`; logs + rethrows on failure (L374-L412).

### packages/excalidraw/data/encryption.ts

Web Crypto (SubtleCrypto) AES-GCM symmetric encryption primitives — IV generation, key generation/import, encrypt, decrypt.

- `export const IV_LENGTH_BYTES = 12` — AES-GCM IV length in bytes (96-bit, the recommended GCM nonce size) (L5).
- `export const createIV = (): Uint8Array<ArrayBuffer>` — fills a 12-byte array with `crypto.getRandomValues` (L7-L10). Crypto detail: fresh random IV per encryption.
- `export const generateEncryptionKey = async <T extends "string" | "cryptoKey">(returnAs?: T)` — generates an extractable AES-GCM key of `ENCRYPTION_KEY_BITS`; returns either the `CryptoKey` or its exported JWK `k` (base64url raw key material) depending on `returnAs` (L12-L30).
- `export const getCryptoKey = (key: string, usage: KeyUsage)` — imports a JWK with `alg: "A128GCM"`, `kty: "oct"`, `key_ops: ["encrypt","decrypt"]` as a non-extractable AES-GCM key for the given usage (L32-L48). Crypto detail: `A128GCM`/`ENCRYPTION_KEY_BITS` implies 128-bit keys; imported key is non-extractable even though gen key is extractable.
- `export const encryptData = async (key: string | CryptoKey, data: ...): Promise<{ encryptedBuffer: ArrayBuffer; iv }>` — coerces key (imports if string), generates IV, normalizes `data` (string→TextEncoder, Blob→arrayBuffer, else as-is), and `crypto.subtle.encrypt` with AES-GCM (L50-L78). Crypto note in comment: AES-GCM is authenticated (tamper detection).
- `export const decryptData = async (iv, encrypted, privateKey: string): Promise<ArrayBuffer>` — imports the key for "decrypt" and `crypto.subtle.decrypt` with AES-GCM + supplied IV (L80-L94).

### packages/excalidraw/data/filesystem.ts

Thin typed wrappers over `browser-fs-access` `fileOpen`/`fileSave`, mapping Excalidraw extension keys to MIME types and re-exporting native-FS support detection.

- `type FILE_EXTENSION` (internal) — `Exclude<keyof typeof MIME_TYPES, "binary">` (L11).
- `export const fileOpen = async <M extends boolean | undefined = false>(opts: { extensions?; description; multiple? })` — builds `mimeTypes` + `extensions` (expanding `jpg`→`.jpg`/`.jpeg`), calls `_fileOpen`, and runs every returned file through `normalizeFile`; return type is `File` or `File[]` keyed on the `multiple` generic `M` (L13-L47). Note: comment flags the conditional return type as "an unsafe TS hack."
- `export const fileSave = (blob: Blob | Promise<Blob>, opts: { name; extension; mimeTypes?; description; fileHandle? })` — calls `_fileSave` with `fileName = "<name>.<extension>"`, passing an existing handle and a trailing `false` flag (L49-L73).
- `export { nativeFileSystemSupported }` — re-export of `browser-fs-access`'s `supported` flag (imported aliased) (L75).

### packages/excalidraw/data/image.ts

Embeds and extracts the Excalidraw scene JSON inside a PNG's `tEXt` metadata chunk (used to make exported PNGs reimportable).

- `export const getTEXtChunk = async (blob: Blob): Promise<{ keyword: string; text: string } | null>` — decodes PNG chunks (`png-chunks-extract`), finds the first chunk named `tEXt`, decodes it via `png-chunk-text`; null if none (L14-L23).
- `export const encodePngMetadata = async ({ blob, metadata }: { blob; metadata: string })` — decodes the PNG's chunks, builds a `tEXt` chunk keyed by `MIME_TYPES.excalidraw` whose value is `JSON.stringify(encode({ text: metadata, compress: true }))`, splices it just before the trailing `IEND` chunk, and re-encodes to a PNG Blob (L25-L47). Encoding detail: scene is zlib-compressed (via `encode`) before being JSON-embedded; chunk inserted at index -1 to precede IEND.
- `export const decodePngMetadata = async (blob: Blob)` — reads the `tEXt` chunk, verifies `keyword === MIME_TYPES.excalidraw`, JSON-parses the value, then: if no `encoded` field but it's a legacy raw `EXPORT_DATA_TYPES.excalidraw` scene returns the text as-is, else `decode`s it; throws `"FAILED"` on parse/decode error and `"INVALID"` if the chunk isn't an Excalidraw scene (L49-L71). Invariant: the `"INVALID"`/`"FAILED"` error messages are matched by `blob.ts` `parseFileContents` to surface `ImageSceneDataError`.
