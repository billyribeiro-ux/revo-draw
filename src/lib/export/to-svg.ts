/**
 * Best-effort SVG snapshot of the scene graph.
 *
 * Unlike the Markdown compiler (semantic intent), this is a *visual* export: it walks elements in
 * paint order and emits simple shapes/text approximating the canvas rendering. It is deterministic
 * (stable ordering, rounded numbers) so the same document yields the same SVG. It is not meant to
 * be pixel-perfect with the Canvas 2D renderer — it's a portable visual reference.
 */
import { bboxCenter } from '../canvas/geometry.ts';
import { isContainerType, type Element, type LayoutDocument } from '../elements/types.ts';

export function compileToSvg(doc: LayoutDocument): string {
	const ordered = paintOrder(doc);
	const w = round(doc.canvas.width + 80);
	const h = round(doc.canvas.height + 80);
	const parts: string[] = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-40 -40 ${w} ${h}" font-family="Inter, system-ui, sans-serif">`
	);
	parts.push(`<rect x="-40" y="-40" width="${w}" height="${h}" fill="${esc(doc.canvas.background)}"/>`);
	for (const el of ordered) {
		if (el.hidden) continue;
		// Per-element error isolation (Excalidraw `staticSvgScene.ts:734-761`): a single malformed
		// element (e.g. a bad icon `viewBox`/`svgPath`) must not abort the entire export. Skip the
		// offending node and emit the rest, so the export degrades gracefully instead of failing.
		try {
			parts.push(renderEl(el));
		} catch {
			// Drop this element from the visual export; the others still render.
		}
	}
	parts.push('</svg>');
	return parts.join('\n') + '\n';
}

function paintOrder(doc: LayoutDocument): Element[] {
	const byParent = new Map<string | null, Element[]>();
	for (const el of Object.values(doc.elements)) {
		const list = byParent.get(el.parentId) ?? [];
		list.push(el);
		byParent.set(el.parentId, list);
	}
	const out: Element[] = [];
	const visit = (parentId: string | null): void => {
		const kids = (byParent.get(parentId) ?? [])
			.slice()
			.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		for (const el of kids) {
			out.push(el);
			if (isContainerType(el.type)) visit(el.id);
		}
	};
	visit(null);
	return out;
}

function transform(el: Element): string {
	if (el.rotation === 0) return '';
	const c = bboxCenter(el);
	return ` transform="rotate(${round((el.rotation * 180) / Math.PI, 2)} ${round(c.x)} ${round(c.y)})"`;
}

function renderEl(el: Element): string {
	const fill = el.style?.fill ?? 'none';
	const stroke = el.style?.stroke ?? 'none';
	const r = el.style?.radius ?? 0;
	const opacity = el.style?.opacity ?? 1;
	const tx = transform(el);
	const op = opacity !== 1 ? ` opacity="${round(opacity, 2)}"` : '';
	const box = `<rect x="${round(el.x)}" y="${round(el.y)}" width="${round(el.width)}" height="${round(
		el.height
	)}" rx="${round(r)}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="1"${tx}${op}/>`;

	switch (el.type) {
		case 'text': {
			const content = el.content;
			const size = el.style?.fontSize ?? 15;
			const weight = el.style?.fontWeight ?? 400;
			return `<text x="${round(el.x)}" y="${round(el.y + size)}" font-size="${round(size)}" font-weight="${round(
				weight
			)}" fill="${esc(el.style?.fill ?? 'oklch(0.22 0.012 264)')}"${tx}${op}>${esc(content)}</text>`;
		}
		case 'button': {
			const content = el.content;
			const c = bboxCenter(el);
			return (
				`<rect x="${round(el.x)}" y="${round(el.y)}" width="${round(el.width)}" height="${round(
					el.height
				)}" rx="${round(r || 6)}" fill="${esc(el.style?.fill ?? 'oklch(0.58 0.16 256)')}"${tx}${op}/>` +
				`<text x="${round(c.x)}" y="${round(c.y + 4)}" text-anchor="middle" font-size="13" fill="oklch(0.99 0.01 256)"${tx}>${esc(
					content
				)}</text>`
			);
		}
		case 'icon': {
			if ('svgPath' in el && el.svgPath) {
				const vb = parseVb('viewBox' in el ? el.viewBox : '0 0 256 256');
				const sx = el.width / vb.w;
				const sy = el.height / vb.h;
				return `<g transform="translate(${round(el.x)} ${round(el.y)}) scale(${round(sx, 4)} ${round(
					sy,
					4
				)})"${op}><path d="${esc(el.svgPath)}" fill="${esc(el.style?.fill ?? 'oklch(0.22 0.012 264)')}"/></g>`;
			}
			return box;
		}
		case 'divider': {
			const orientation = 'orientation' in el ? el.orientation : 'horizontal';
			const c = bboxCenter(el);
			if (orientation === 'vertical') {
				return `<line x1="${round(c.x)}" y1="${round(el.y)}" x2="${round(c.x)}" y2="${round(
					el.y + el.height
				)}" stroke="${esc(el.style?.stroke ?? 'oklch(0.84 0.008 264)')}" stroke-width="1"${tx}${op}/>`;
			}
			return `<line x1="${round(el.x)}" y1="${round(c.y)}" x2="${round(el.x + el.width)}" y2="${round(
				c.y
			)}" stroke="${esc(el.style?.stroke ?? 'oklch(0.84 0.008 264)')}" stroke-width="1"${tx}${op}/>`;
		}
		case 'input': {
			const ph = ('placeholder' in el && el.placeholder) || el.label || 'Input';
			return (
				`<rect x="${round(el.x)}" y="${round(el.y)}" width="${round(el.width)}" height="${round(
					el.height
				)}" rx="${round(r || 6)}" fill="oklch(1 0 0)" stroke="oklch(0.82 0.008 264)" stroke-width="1"${tx}${op}/>` +
				`<text x="${round(el.x + 12)}" y="${round(el.y + el.height / 2 + 4)}" font-size="13" fill="oklch(0.64 0.011 264)"${tx}>${esc(ph)}</text>`
			);
		}
		case 'table': {
			const cols = ('columns' in el && el.columns?.length ? el.columns.length : 3);
			const rows = ('rowCountHint' in el && el.rowCountHint ? el.rowCountHint : 5);
			const headerH = 28;
			const colW = el.width / cols;
			const rowH = (el.height - headerH) / Math.max(1, rows);
			let g = `<g${tx}${op}>`;
			g += `<rect x="${round(el.x)}" y="${round(el.y)}" width="${round(el.width)}" height="${round(el.height)}" rx="${round(r || 6)}" fill="oklch(1 0 0)" stroke="oklch(0.9 0.005 264)"/>`;
			g += `<rect x="${round(el.x)}" y="${round(el.y)}" width="${round(el.width)}" height="${headerH}" fill="oklch(0.965 0.004 110)"/>`;
			for (let c = 0; c < cols; c++) {
				const colName = ('columns' in el && el.columns?.[c]) || `Col ${c + 1}`;
				g += `<text x="${round(el.x + c * colW + 8)}" y="${round(el.y + headerH / 2 + 4)}" font-size="11" font-weight="600" fill="oklch(0.46 0.013 264)">${esc(colName)}</text>`;
				if (c > 0) g += `<line x1="${round(el.x + c * colW)}" y1="${round(el.y)}" x2="${round(el.x + c * colW)}" y2="${round(el.y + el.height)}" stroke="oklch(0.93 0.005 264)"/>`;
			}
			for (let rr2 = 1; rr2 <= rows; rr2++) {
				const ry = el.y + headerH + rr2 * rowH;
				if (ry > el.y + el.height - 0.5) break;
				g += `<line x1="${round(el.x)}" y1="${round(ry)}" x2="${round(el.x + el.width)}" y2="${round(ry)}" stroke="oklch(0.93 0.005 264)"/>`;
			}
			return g + '</g>';
		}
		case 'chart': {
			const kind = el.chartKind;
			const pad = 16;
			const ix = el.x + pad;
			const iy = el.y + pad;
			const iw = el.width - pad * 2;
			const ih = el.height - pad * 2;
			let g = `<g${tx}${op}>`;
			g += `<rect x="${round(el.x)}" y="${round(el.y)}" width="${round(el.width)}" height="${round(el.height)}" rx="${round(r || 6)}" fill="oklch(1 0 0)" stroke="oklch(0.9 0.005 264)"/>`;
			g += `<polyline points="${round(ix)},${round(iy)} ${round(ix)},${round(iy + ih)} ${round(ix + iw)},${round(iy + ih)}" fill="none" stroke="oklch(0.88 0.006 264)"/>`;
			if (kind === 'bar') {
				const n = 6;
				const bw = (iw / n) * 0.6;
				for (let i = 0; i < n; i++) {
					const h = ih * (0.3 + 0.6 * Math.abs(Math.sin(i * 1.2)));
					const bx = ix + (iw / n) * i + (iw / n - bw) / 2;
					g += `<rect x="${round(bx)}" y="${round(iy + ih - h)}" width="${round(bw)}" height="${round(h)}" fill="oklch(0.55 0.17 264)"/>`;
				}
			} else {
				const n = 7;
				const pts: string[] = [];
				for (let i = 0; i < n; i++) {
					const px = ix + (iw / (n - 1)) * i;
					const py = iy + ih - ih * (0.25 + 0.55 * Math.abs(Math.sin(i * 0.9 + 0.5)));
					pts.push(`${round(px)},${round(py)}`);
				}
				g += `<polyline points="${pts.join(' ')}" fill="none" stroke="oklch(0.55 0.17 264)" stroke-width="1.5"/>`;
			}
			return g + '</g>';
		}
		case 'list': {
			const n = ('itemCountHint' in el && el.itemCountHint ? el.itemCountHint : 4);
			const pad = 12;
			const rowH = Math.min(28, (el.height - pad * 2) / Math.max(1, n));
			let g = `<g${tx}${op}>`;
			g += `<rect x="${round(el.x)}" y="${round(el.y)}" width="${round(el.width)}" height="${round(el.height)}" rx="${round(r || 6)}" fill="none" stroke="oklch(0.9 0.005 264)"/>`;
			for (let i = 0; i < n; i++) {
				const cy2 = el.y + pad + i * rowH + rowH / 2;
				if (cy2 > el.y + el.height - pad) break;
				g += `<circle cx="${round(el.x + pad + 3)}" cy="${round(cy2)}" r="2.5" fill="oklch(0.64 0.011 264)"/>`;
				g += `<rect x="${round(el.x + pad + 18)}" y="${round(cy2 - 5)}" width="${round(el.width - pad * 2 - 18)}" height="10" rx="5" fill="oklch(0.92 0.006 264)"/>`;
			}
			return g + '</g>';
		}
		default: {
			// Container/card/frame/nav/sidebar/etc.: the box plus its label if any.
			if (el.label) {
				return (
					box +
					`<text x="${round(el.x + 10)}" y="${round(el.y + 20)}" font-size="11" font-weight="500" fill="oklch(0.5 0.012 264)"${tx}>${esc(
						el.label
					)}</text>`
				);
			}
			return box;
		}
	}
}

function parseVb(vb: string): { w: number; h: number } {
	const p = vb.trim().split(/\s+/).map(Number);
	return p.length === 4 && p.every(Number.isFinite) ? { w: p[2]!, h: p[3]! } : { w: 256, h: 256 };
}

function round(n: number, dp = 0): number {
	const f = Math.pow(10, dp);
	return Math.round(n * f) / f;
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
