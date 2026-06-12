## Cluster: fractional-indexing__src

This cluster contains a single file: a vendored implementation of the `fractional-indexing` npm package (CC0), based on David Greenspan's "Implementing Fractional Indexing" article. Fractional indexing produces short, lexicographically-orderable string keys so that an element can be inserted *between* any two existing elements without renumbering the rest — Excalidraw uses these keys as `fractionalIndex` to maintain a stable z-order under collaborative reconciliation.

### packages/fractional-indexing/src/index.ts

Pure string-arithmetic library that generates order keys between two existing keys (or relative to the START/END boundary), in a configurable base-62 digit alphabet. An "order key" is structured as `integer-part + fraction-part`, where the integer part's first character (the "head") is a letter encoding the length of the integer part, and the fraction part is the lexicographic tail. No DOM, no side effects beyond throwing; all functions are deterministic and pure given their inputs.

- `BASE_62_DIGITS` (exported const, L5-L6)
  - Value: `"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"` — the default digit alphabet.
  - Invariant (documented L11-L12, L204-L205): digit characters **must be in ascending character-code order**, because all comparisons rely on lexicographic (charcode) ordering matching numeric digit order. `digits[0]` is the canonical "zero" digit (`"0"`); `digits.slice(-1)` is the max digit (`"z"`).
  - Note: digit *value* is recovered via `digits.indexOf(char)`, so the alphabet need not be contiguous in charcode space, only monotonic.

- `function midpoint(a: string, b: string | null | undefined, digits: string): string` (internal, L19-L62)
  - Computes a string strictly between fraction strings `a` and `b` (where `a < b` lexicographically if `b` is non-null), recursively. This is the core "insert between" primitive operating on the *fraction part only*.
  - Preconditions/guards: `a` may be empty; `b` is null or non-empty. Throws `"${a} >= ${b}"` if `b != null && a >= b` (L25-L27). Throws `"trailing zero"` if either `a` or `b` ends in the zero digit (L28-L30) — no trailing zeros allowed, which keeps keys canonical/minimal.
  - Algorithm:
    1. **Common-prefix stripping** (L31-L42): if `b` is set, advance `n` while `(a[n] || zero) === b[n]` — note `a` is virtually right-padded with `zero` once exhausted. If a common prefix exists (`n > 0`), recurse on the suffixes and re-prepend `b.slice(0, n)`.
    2. **Different leading digits** (L43-L49): `digitA = a ? indexOf(a[0]) : 0`; `digitB = b != null ? indexOf(b[0]) : digits.length` (i.e. one past the max digit when `b` is null). If the gap `digitB - digitA > 1`, return the single rounded mid digit `digits[round(0.5*(digitA+digitB))]`.
    3. **Consecutive leading digits, b length > 1** (L50-L53): return `b.slice(0,1)` (the first digit of `b` is already between `a`'s leading digit and `b`).
    4. **Recursive descent** (L55-L61): otherwise return `digits[digitA] + midpoint(a.slice(1), null, digits)` — fix `a`'s first digit and recurse into its tail with `null` upper bound (illustrated example: `midpoint('49','5')` -> `'495'`).
  - Output: a fraction string strictly between `a` and `b`, with no trailing zero.
  - Performance/parity note: recursion depth is bounded by the shared prefix length plus the descent into `a`; non-obvious that the right-pad-`a`-with-zero rule (`a[n] || zero`) is what lets the common-prefix loop terminate correctly when `a` is the shorter string.

- `function validateInteger(int: string): void` (internal, L69-L73)
  - Asserts that the integer-part string `int` has exactly the length its head character mandates (`getIntegerLength(int[0])`); throws `"invalid integer part of order key: ${int}"` otherwise. Pure validation, no return.

- `function getIntegerLength(head: string): number` (internal, L80-L88)
  - Maps the head character to the total length of the integer part. For lowercase `a`–`z`: `head.charCodeAt(0) - 'a'.charCodeAt(0) + 2` (so `a`->2 ... `z`->27). For uppercase `A`–`Z`: `'Z'.charCodeAt(0) - head.charCodeAt(0) + 2` (so `Z`->2 ... `A`->27). Throws `"invalid order key head: ${head}"` for any other character.
  - Non-obvious math (key for parity): lowercase heads encode *positive* magnitudes with length growing as the letter increases; uppercase heads encode *negative* magnitudes with length growing as the letter *decreases*. This is the variable-length integer encoding that makes the key space unbounded in both directions while keeping ordering lexicographic. Returns the count of characters (head + following digits).

- `function getIntegerPart(key: string): string` (internal, L95-L102)
  - Returns the leading integer-part substring of an order `key` using `getIntegerLength(key[0])`. Throws `"invalid order key: ${key}"` if the computed length exceeds the key length (L98-L100). Output is `key.slice(0, integerPartLength)`.

- `export function validateOrderKey(key: string, digits: string = BASE_62_DIGITS): void` (exported, L109-L125)
  - Validates a complete order key. Checks every character is in `digits` (L113); throws `"invalid order key: ${key}"` if `key` equals the reserved smallest sentinel `A${zero.repeat(26)}` or contains invalid chars (L114-L116). Then calls `getIntegerPart` (which itself throws on a bad head or too-short key, L117-L120), and finally throws if the fraction part `f` ends in the zero digit (L121-L124) — enforcing the no-trailing-zero canonical form. Pure validation, no return.

- `function incrementInteger(x: string, digits: string): string | null` (internal, L133-L162)
  - Returns the next integer-part key after `x`, or `null` if `x` is the largest representable integer. Splits into `head` + `digs[]`, then performs base-`digits.length` increment-with-carry over `digs` from the least-significant end (L137-L145).
  - Carry handling when all digits overflow (L146-L160): if `head === 'Z'` wrap to `` `a${zero}` `` (transition from the largest negative-magnitude head into the smallest positive one); if `head === 'z'` return `null` (no larger integer); otherwise advance the head by one charcode (`h`), and **adjust length**: if `h > 'a'` push a zero digit (length grows), else pop one (length shrinks) — keeping `digs` length consistent with `getIntegerLength(h)`. Returns `h + digs.join("")`.
  - Validates input via `validateInteger` first (L134). Invariant: output (when non-null) is a valid integer part strictly greater than `x` lexicographically.

- `function decrementInteger(x: string, digits: string): string | null` (internal, L170-L199)
  - Mirror of `incrementInteger`: returns the previous integer-part key, or `null` if `x` is the smallest. Borrow propagation: on underflow a digit becomes `digits.slice(-1)` (max digit) (L176-L177). Terminal-borrow handling (L183-L196): if `head === 'a'` wrap to `` `Z${maxDigit}` ``; if `head === 'A'` return `null`; otherwise decrement head charcode and adjust length (push max digit if `h < 'Z'`, else pop). Validates via `validateInteger`. Returns the integer part strictly less than `x`.

- `export function generateKeyBetween(a: string | null | undefined, b: string | null | undefined, digits = BASE_62_DIGITS): string` (exported, L212-L268)
  - The primary public API: produce one order key strictly between `a` (START boundary if null) and `b` (END boundary if null).
  - Validates both bounds if present (L217-L222) and throws `"${a} >= ${b}"` if both non-null and `a >= b` (L223-L225).
  - Cases:
    - **Both null** (L226-L229): return `` `a${zero}` `` (the canonical first key, e.g. `"a0"`).
    - **a null, b set** (L231-L243): split `b` into integer `ib` + fraction `fb`. If `ib` is the smallest-sentinel integer, return `ib + midpoint("", fb, digits)`; else if `ib < b` (b has a fraction), return `ib`; else decrement `ib` (throws `"cannot decrement any more"` if null).
    - **a set, b null** (L246-L251): increment `a`'s integer part; if it overflows (`null`), return `ia + midpoint(fa, null, digits)` to grow the fraction instead.
    - **Both set** (L253-L267): if integer parts equal, return `ia + midpoint(fa, fb, digits)`. Otherwise increment `ia`; if the incremented integer is still `< b`, return it; else fall back to `ia + midpoint(fa, null, digits)`.
  - Output: a single valid order key with no trailing zero. Determinism is total (pure function of inputs). This is the function Excalidraw calls per-element to assign/repair `fractionalIndex`.

- `export function generateNKeysBetween(a: string | null | undefined, b: string | null | undefined, n: number, digits = BASE_62_DIGITS): string[]` (exported, L284-L322)
  - Returns `n` distinct keys in sorted order between `a` and `b`. Precondition `n >= 0`.
  - Base cases: `n === 0` -> `[]` (L290-L292); `n === 1` -> single `generateKeyBetween` (L293-L295).
  - **b null** (L296-L304): chain forward — repeatedly generate `generateKeyBetween(c, null)` building ascending integer-like keys.
  - **a null** (L305-L314): chain backward by generating `generateKeyBetween(null, c)` then `result.reverse()` to restore ascending order.
  - **Both set** (L315-L321): divide-and-conquer — compute one midpoint `c = generateKeyBetween(a, b)`, then recurse `[...generateNKeysBetween(a, c, mid), c, ...generateNKeysBetween(c, b, n - mid - 1)]` with `mid = floor(n/2)`. This balanced recursion keeps generated keys short (O(log n) length growth) rather than degenerating into a long forward chain.
  - Output: array of length `n`, strictly ascending, each a valid order key. Performance note (relevant for parity): the divide-and-conquer split is the key difference from naive sequential generation — it bounds key length and is the path exercised when bulk-inserting/repairing many elements at once.
