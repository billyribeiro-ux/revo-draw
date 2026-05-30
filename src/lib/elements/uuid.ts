/**
 * UUID v7 generation (time-ordered, RFC 9562). We hand-roll it rather than pull a dependency:
 * v7 is a 48-bit big-endian Unix-ms timestamp, version/variant nibbles, and random bits.
 * Time-ordered ids keep document files and library rows naturally sortable by creation.
 *
 * Uses `crypto.getRandomValues` (available in the Tauri webview). No network, no deps.
 */
export function uuidv7(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);

	const ms = Date.now();
	// 48-bit timestamp, big-endian, into bytes 0..5
	bytes[0] = (ms / 0x10000000000) & 0xff;
	bytes[1] = (ms / 0x100000000) & 0xff;
	bytes[2] = (ms / 0x1000000) & 0xff;
	bytes[3] = (ms / 0x10000) & 0xff;
	bytes[4] = (ms / 0x100) & 0xff;
	bytes[5] = ms & 0xff;

	// version 7 in the high nibble of byte 6
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
	// variant (10xx) in the high bits of byte 8
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

	const hex: string[] = [];
	for (let i = 0; i < 16; i++) {
		hex.push((bytes[i] ?? 0).toString(16).padStart(2, '0'));
	}
	return (
		hex.slice(0, 4).join('') +
		'-' +
		hex.slice(4, 6).join('') +
		'-' +
		hex.slice(6, 8).join('') +
		'-' +
		hex.slice(8, 10).join('') +
		'-' +
		hex.slice(10, 16).join('')
	);
}
