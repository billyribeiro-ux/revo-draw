// Standalone export harness for the §14.2 evidence pass. Builds a representative 2-column
// dashboard fixture and exports it to Markdown via the real compiler — no test runner involved.
// Usage: node scripts/export-fixture.mjs <outfile>
import { writeFileSync } from 'node:fs';
import { compileToMarkdown } from '../src/lib/export/to-markdown.ts';

function el(p) {
	return { parentId: null, x: 0, y: 0, width: 100, height: 100, rotation: 0, z: 0, ...p };
}

const elements = {};
const add = (e) => { elements[e.id] = e; };

// Screen frame
add(el({ id: 'frame', type: 'frame', label: 'Dashboard', x: 0, y: 0, width: 1440, height: 1024,
	layout: { mode: 'flex-row', gap: 0, padding: 0, responsive: 'reflow' } }));

// Sidebar (fixed)
add(el({ id: 'sidebar', type: 'sidebar', label: 'Sidebar', parentId: 'frame', x: 0, y: 0, width: 240, height: 1024, z: 0, side: 'left',
	layout: { mode: 'flex-col', gap: 8, padding: 16, fixedWidth: 240, responsive: 'none' } }));
add(el({ id: 'nav', type: 'nav', label: 'Primary nav', parentId: 'sidebar', x: 16, y: 16, width: 208, height: 220, z: 0, orientation: 'vertical',
	layout: { mode: 'flex-col', gap: 4, padding: 0, responsive: 'none' } }));
add(el({ id: 'b1', type: 'button', parentId: 'nav', x: 16, y: 16, width: 208, height: 40, z: 0, content: 'Overview', variant: 'ghost', iconName: 'ph:house' }));
add(el({ id: 'b2', type: 'button', parentId: 'nav', x: 16, y: 64, width: 208, height: 40, z: 1, content: 'Reports', variant: 'ghost', iconName: 'ph:chart-bar' }));
add(el({ id: 'b3', type: 'button', parentId: 'nav', x: 16, y: 112, width: 208, height: 40, z: 2, content: 'Settings', variant: 'ghost', iconName: 'ph:gear' }));
add(el({ id: 'icon1', type: 'icon', parentId: 'sidebar', x: 16, y: 970, width: 24, height: 24, z: 1, iconName: 'ph:user-circle', svgPath: 'M0 0', viewBox: '0 0 256 256' }));

// Main column (fluid)
add(el({ id: 'main', type: 'container', label: 'Main', parentId: 'frame', x: 240, y: 0, width: 1200, height: 1024, z: 1,
	layout: { mode: 'flex-col', gap: 24, padding: 32, responsive: 'reflow' } }));

// Header bar
add(el({ id: 'header', type: 'container', label: 'Header', parentId: 'main', x: 272, y: 32, width: 1136, height: 48, z: 0,
	layout: { mode: 'flex-row', gap: 16, justify: 'space-between', align: 'center', responsive: 'reflow' } }));
add(el({ id: 'h1', type: 'text', parentId: 'header', x: 272, y: 40, width: 240, height: 32, z: 0, content: 'Dashboard', textRole: 'h1' }));
add(el({ id: 'exportbtn', type: 'button', parentId: 'header', x: 1300, y: 36, width: 108, height: 40, z: 1, content: 'Export', variant: 'primary', iconName: 'ph:export' }));

// Stat-card row (3 equal cards → should infer flex-row, stack on narrow set explicitly)
add(el({ id: 'stats', type: 'container', label: 'Stats row', parentId: 'main', x: 272, y: 104, width: 1136, height: 140, z: 1,
	layout: { mode: 'flex-row', gap: 16, responsive: 'stack' } }));
add(el({ id: 'cR', type: 'card', label: 'Revenue', parentId: 'stats', x: 272, y: 104, width: 360, height: 140, z: 0 }));
add(el({ id: 'cU', type: 'card', label: 'Users', parentId: 'stats', x: 656, y: 104, width: 360, height: 140, z: 1 }));
add(el({ id: 'cC', type: 'card', label: 'Churn', parentId: 'stats', x: 1040, y: 104, width: 360, height: 140, z: 2 }));

// Chart region (nested container holding a chart) fills width
add(el({ id: 'chartcard', type: 'card', label: 'Trend', parentId: 'main', x: 272, y: 268, width: 1136, height: 360, z: 2,
	layout: { mode: 'flex-col', gap: 8, padding: 16, responsive: 'reflow' } }));
add(el({ id: 'chart', type: 'chart', label: 'Revenue trend', parentId: 'chartcard', x: 288, y: 292, width: 1104, height: 320, z: 0, chartKind: 'line', caption: 'Last 12 months' }));

const doc = {
	schemaVersion: 1,
	id: 'evidence-dashboard',
	name: 'Acme Analytics',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-02T00:00:00.000Z',
	canvas: { width: 1440, height: 1024, background: 'oklch(0.955 0.004 110)' },
	elements,
	rootOrder: ['frame']
};

const md = compileToMarkdown(doc);
const out = process.argv[2];
if (out) writeFileSync(out, md);
else process.stdout.write(md);
