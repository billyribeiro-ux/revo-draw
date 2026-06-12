// Dependency-free Mermaid flowchart → Excalidraw elements converter.
//
// Excalidraw uses the heavy `@excalidraw/mermaid-to-excalidraw` (which bundles the
// full `mermaid` library: parser + d3 + dagre) for ALL diagram types. To keep the
// pinned-deps discipline (no unpinned multi-MB dependency), this implements the
// common case natively: `graph TD|LR` flowcharts with `A-->B`, node labels
// `A[Label]` / `A(Label)` / `A{Label}`, and edge labels `A-->|text|B`. Nodes are
// laid out in a simple layered grid. If you ever need sequence/class/state/gantt
// diagrams, `pnpm add @excalidraw/mermaid-to-excalidraw` and swap the converter.

import { ROUNDNESS } from "@excalidraw/common";

import { newArrowElement, newElement, newTextElement } from "@excalidraw/element";

import { pointFrom } from "@excalidraw/math";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

const NODE_W = 160;
const NODE_H = 60;
const GAP_X = 80;
const GAP_Y = 60;

interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
}

interface ParsedGraph {
  direction: "TD" | "LR";
  nodeLabels: Map<string, string>;
  edges: ParsedEdge[];
  /** insertion order of node ids */
  order: string[];
}

/** Strip a node id + optional label decoration: `A[Hi]` → {id:"A", label:"Hi"}. */
const parseNode = (
  token: string,
  labels: Map<string, string>,
  order: string[],
): string => {
  const m = token.match(/^([A-Za-z0-9_]+)(?:[[({]+(.+?)[\])}]+)?$/);
  if (!m) {
    return token.trim();
  }
  const id = m[1]!;
  if (!labels.has(id)) {
    order.push(id);
    labels.set(id, m[2] ?? id);
  } else if (m[2]) {
    labels.set(id, m[2]);
  }
  return id;
};

/** Parse a `graph`/`flowchart` Mermaid source. Throws on unsupported diagrams. */
export const parseMermaidFlowchart = (source: string): ParsedGraph => {
  const lines = source
    .split(/[\n;]/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Empty diagram.");
  }

  const header = lines[0]!.match(/^(?:graph|flowchart)\s+(TB|TD|BT|LR|RL)/i);
  if (!header) {
    throw new Error(
      "Only `graph TD` / `flowchart LR` flowcharts are supported by the built-in converter.",
    );
  }
  const dir = header[1]!.toUpperCase();
  const direction: "TD" | "LR" = dir === "LR" || dir === "RL" ? "LR" : "TD";

  const nodeLabels = new Map<string, string>();
  const order: string[] = [];
  const edges: ParsedEdge[] = [];

  for (const line of lines.slice(1)) {
    // edge: LHS -->|label|? RHS  (also -.->, ==>)
    const edge = line.match(
      /^(.+?)\s*[-=.]+>?\s*(?:\|([^|]*)\|)?\s*[-=.]*>?\s*(.+)$/,
    );
    const arrowLike = /[-=.]+>/.test(line);
    if (edge && arrowLike) {
      const from = parseNode(edge[1]!.trim(), nodeLabels, order);
      const to = parseNode(edge[3]!.trim(), nodeLabels, order);
      edges.push({ from, to, label: edge[2]?.trim() || undefined });
    } else {
      // standalone node declaration
      parseNode(line, nodeLabels, order);
    }
  }

  if (!order.length) {
    throw new Error("No nodes found in the diagram.");
  }

  return { direction, nodeLabels, edges, order };
};

/**
 * Convert Mermaid flowchart source to Excalidraw elements (rectangles with bound
 * text + arrows). Layout: BFS layers from roots, packed in a grid along the flow
 * direction. Returns the synthesized elements; the caller inserts them.
 */
export const mermaidToElements = (source: string): ExcalidrawElement[] => {
  const { direction, nodeLabels, edges, order } = parseMermaidFlowchart(source);

  // assign a layer (depth) per node via BFS from nodes with no incoming edge
  const incoming = new Map<string, number>();
  for (const id of order) {
    incoming.set(id, 0);
  }
  for (const e of edges) {
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  }
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }

  const layer = new Map<string, number>();
  const queue: string[] = order.filter((id) => (incoming.get(id) ?? 0) === 0);
  for (const id of queue) {
    layer.set(id, 0);
  }
  // fall back: if every node has an incoming edge (a cycle), seed the first node
  if (!queue.length && order.length) {
    queue.push(order[0]!);
    layer.set(order[0]!, 0);
  }
  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++]!;
    const d = layer.get(id) ?? 0;
    for (const next of adjacency.get(id) ?? []) {
      if (!layer.has(next)) {
        layer.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  // any unreached node → its own trailing layer
  let maxLayer = 0;
  for (const v of layer.values()) {
    maxLayer = Math.max(maxLayer, v);
  }
  for (const id of order) {
    if (!layer.has(id)) {
      layer.set(id, ++maxLayer);
    }
  }

  // group nodes by layer (preserving order) → grid coords
  const byLayer = new Map<number, string[]>();
  for (const id of order) {
    const d = layer.get(id) ?? 0;
    const list = byLayer.get(d) ?? [];
    list.push(id);
    byLayer.set(d, list);
  }

  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of byLayer) {
    ids.forEach((idNode, i) => {
      // along the flow axis = layer; across = index within layer
      const along = d * (direction === "TD" ? NODE_H + GAP_Y : NODE_W + GAP_X);
      const across = i * (direction === "TD" ? NODE_W + GAP_X : NODE_H + GAP_Y);
      pos.set(idNode, {
        x: direction === "TD" ? across : along,
        y: direction === "TD" ? along : across,
      });
    });
  }

  const elements: ExcalidrawElement[] = [];
  const rectById = new Map<string, ExcalidrawElement>();

  for (const id of order) {
    const p = pos.get(id)!;
    const rect = newElement({
      type: "rectangle",
      x: p.x,
      y: p.y,
      width: NODE_W,
      height: NODE_H,
      backgroundColor: "transparent",
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
    });
    rectById.set(id, rect);
    elements.push(rect);

    // a centered text element labelling the node (positioned, not bound — keeps
    // the converter simple while remaining editable)
    const label = nodeLabels.get(id) ?? id;
    const text = newTextElement({
      text: label,
      x: p.x + 12,
      y: p.y + NODE_H / 2 - 10,
      fontSize: 16,
      textAlign: "center",
    });
    elements.push(text);
  }

  for (const e of edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) {
      continue;
    }
    const start = { x: a.x + NODE_W / 2, y: a.y + NODE_H };
    const end = { x: b.x + NODE_W / 2, y: b.y };
    const arrow = newArrowElement({
      type: "arrow",
      x: start.x,
      y: start.y,
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(end.x - start.x, end.y - start.y),
      ],
      endArrowhead: "arrow",
    });
    elements.push(arrow);

    if (e.label) {
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      elements.push(
        newTextElement({ text: e.label, x: mid.x, y: mid.y - 8, fontSize: 14 }),
      );
    }
  }

  return elements;
};
