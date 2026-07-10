import type { BuildSpecArtifact } from "@mullion/schemas";
import { artifactEdges, artifactNodes } from "./render.js";

/**
 * Deterministic SVG render of the architecture graph for the Fork A bundle
 * (01 §6 — "diagram exported as an image/SVG plus the structured graph as
 * JSON"). Fixed three-column layout (external → service → datastore); task
 * nodes live in the task-graph files, not this diagram.
 */

const BOX_W = 220;
const BOX_H = 72;
const COL_GAP = 140;
const ROW_GAP = 40;
const PADDING = 48;

const KIND_COLUMNS = ["external", "service", "datastore"] as const;

const KIND_FILL: Record<string, string> = {
  external: "#f5f0e8",
  service: "#e8eef5",
  datastore: "#e9f2ea",
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function renderDiagramSvg(artifact: BuildSpecArtifact): string {
  const nodes = artifactNodes(artifact).filter((n) => n.kind !== "task");
  const edges = artifactEdges(artifact);
  const nodeKeys = new Set(nodes.map((n) => n.nodeKey));

  const positions = new Map<string, { x: number; y: number }>();
  let maxRows = 1;
  KIND_COLUMNS.forEach((kind, columnIndex) => {
    const column = nodes.filter((n) => n.kind === kind);
    maxRows = Math.max(maxRows, column.length);
    column.forEach((node, rowIndex) => {
      positions.set(node.nodeKey, {
        x: PADDING + columnIndex * (BOX_W + COL_GAP),
        y: PADDING + rowIndex * (BOX_H + ROW_GAP),
      });
    });
  });

  const width = PADDING * 2 + KIND_COLUMNS.length * BOX_W + (KIND_COLUMNS.length - 1) * COL_GAP;
  const height = PADDING * 2 + maxRows * BOX_H + (maxRows - 1) * ROW_GAP;

  const edgeLines = edges
    .filter((e) => nodeKeys.has(e.sourceKey) && nodeKeys.has(e.targetKey))
    .map((e) => {
      const from = positions.get(e.sourceKey);
      const to = positions.get(e.targetKey);
      if (!from || !to) return "";
      const x1 = from.x + BOX_W / 2;
      const y1 = from.y + BOX_H / 2;
      const x2 = to.x + BOX_W / 2;
      const y2 = to.y + BOX_H / 2;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const label = e.label
        ? `<text x="${midX}" y="${midY - 6}" text-anchor="middle" font-size="11" fill="#666">${escapeXml(truncate(e.label, 32))}</text>`
        : "";
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8a8a8a" stroke-width="1.5" marker-end="url(#arrow)" />${label}`;
    })
    .join("\n  ");

  const nodeBoxes = nodes
    .map((n) => {
      const pos = positions.get(n.nodeKey);
      if (!pos) return "";
      const fill = KIND_FILL[n.kind] ?? "#eee";
      return [
        `<g>`,
        `<rect x="${pos.x}" y="${pos.y}" width="${BOX_W}" height="${BOX_H}" rx="8" fill="${fill}" stroke="#444" stroke-width="1.5" />`,
        `<text x="${pos.x + BOX_W / 2}" y="${pos.y + 28}" text-anchor="middle" font-size="14" font-weight="bold" fill="#1a1a1a">${escapeXml(truncate(n.label, 28))}</text>`,
        `<text x="${pos.x + BOX_W / 2}" y="${pos.y + 48}" text-anchor="middle" font-size="11" fill="#555">${escapeXml(n.kind)} · ${escapeXml(truncate(n.nodeKey, 24))}</text>`,
        `</g>`,
      ].join("");
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8a8a" />
    </marker>
  </defs>
  <rect width="${width}" height="${height}" fill="#ffffff" />
  ${edgeLines}
  ${nodeBoxes}
</svg>
`;
}
