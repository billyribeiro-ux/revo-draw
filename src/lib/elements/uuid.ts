/**
 * UUID v7 generation (time-ordered, RFC 9562). We hand-roll it rather than pull a dependency:
 * v7 is a 48-bit big-endian Unix-ms timestamp, version/variant nibbles, and random bits.
 * Time-ordered ids keep document files and library rows naturally sortable by creation.
 *
 * Monotonicity (RFC 9562 §6.2, method 1 — "replace leftmost random bits with an increased clock
 * sequence"): when several ids are minted within the SAME millisecond (bulk paste/duplicate/group
 * create), a 12-bit counter in the `rand_a` field (bytes 6–7) increments so the ids stay strictly
 * ordered, not just unique. The counter resets whenever the clock advances.
 *
 * Uses `crypto.getRandomValues` (available in the Tauri webview and the browser). No network, no deps.
 */
let lastMs = -1;
let seq = 0; // 12-bit monotonic counter within a single millisecond

export function uuidv7(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);

	let ms = Date.now();
	if (ms === lastMs) {
		seq = (seq + 1) & 0x0fff;
		// Counter wrapped within the same ms (>4096 ids in 1ms) — borrow a virtual millisecond so
		// ordering is still strictly increasing rather than colliding.
		if (seq === 0) ms = ++lastMs;
	} else {
		// Clock advanced (or went backwards — clamp forward to preserve monotonicity).
		if (ms < lastMs) ms = lastMs;
		else lastMs = ms;
		seq = 0;
	}

	// 48-bit timestamp, big-endian, into bytes 0..5 (bit-shifting; split at 32 bits to stay within
	// safe-integer/bitwise range — the high 16 bits via division, the low 32 via shifts).
	const hi = Math.floor(ms / 0x100000000); // top 16 bits
	const lo = ms >>> 0; // low 32 bits
	bytes[0] = (hi >>> 8) & 0xff;
	bytes[1] = hi & 0xff;
	bytes[2] = (lo >>> 24) & 0xff;
	bytes[3] = (lo >>> 16) & 0xff;
	bytes[4] = (lo >>> 8) & 0xff;
	bytes[5] = lo & 0xff;

	// rand_a (12 bits across bytes 6–7) carries the monotonic counter; version 7 in the high nibble.
	bytes[6] = 0x70 | ((seq >>> 8) & 0x0f);
	bytes[7] = seq & 0xff;
	// variant (10xx) in the high bits of byte 8; bytes 8..15 keep their random fill (rand_b).
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;

	let out = '';
	for (let i = 0; i < 16; i++) {
		out += bytes[i]!.toString(16).padStart(2, '0');
		if (i === 3 || i === 5 || i === 7 || i === 9) out += '-';
	}
	return out;
}
