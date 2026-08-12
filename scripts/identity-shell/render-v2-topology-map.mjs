import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getIdentityShellDocument,
  readAccessor,
  readGlb,
} from "../shell/glb.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const GLB_PATH = path.join(
  PROJECT_ROOT,
  "assets/candidates/identity-shell/2.0.0/identity-shell.glb",
);

const args = new Map(
  process.argv.slice(2).flatMap((value, index, values) =>
    value.startsWith("--") ? [[value, values[index + 1]]] : [],
  ),
);
const outputPath = path.resolve(args.get("--output") ?? "v2-topology.svg");
const feature = args.get("--feature") ?? "face";

const frames = {
  face: { x: [-0.46, 0.46], y: [-0.5, 0.62], labels: false },
  "left-eye": { x: [-0.36, -0.06], y: [0.16, 0.48], labels: true },
  "right-eye": { x: [0.06, 0.36], y: [0.16, 0.48], labels: true },
  nose: { x: [-0.2, 0.2], y: [-0.12, 0.28], labels: true },
  lips: { x: [-0.32, 0.32], y: [-0.34, -0.08], labels: true },
  "left-cheek": { x: [-0.46, -0.08], y: [-0.15, 0.25], labels: true },
  jaw: { x: [-0.46, 0.46], y: [-0.58, -0.08], labels: true },
};
const frame = frames[feature];
if (!frame) {
  throw new Error(`Unknown topology feature ${feature}.`);
}

const glb = await readGlb(GLB_PATH);
const { primitive } = getIdentityShellDocument(glb, "FLAME2023Open");
const positions = readAccessor(glb, primitive.attributes.POSITION);
const indices = readAccessor(glb, primitive.indices);
const width = 1600;
const height = 1600;
const margin = 64;
const project = ([x, y]) => [
  margin + ((x - frame.x[0]) / (frame.x[1] - frame.x[0])) * (width - margin * 2),
  height -
    margin -
    ((y - frame.y[0]) / (frame.y[1] - frame.y[0])) *
      (height - margin * 2),
];
const inFrame = ([x, y]) =>
  x >= frame.x[0] && x <= frame.x[1] && y >= frame.y[0] && y <= frame.y[1];

const frontTriangles = [];
const visibleVertices = new Set();
for (let offset = 0; offset < indices.length; offset += 3) {
  const triangle = indices.slice(offset, offset + 3);
  if (triangle.some((index) => index >= 3931)) {
    continue;
  }
  const [a, b, c] = triangle.map((index) => positions[index]);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normalZ = ab[0] * ac[1] - ab[1] * ac[0];
  const averageZ = (a[2] + b[2] + c[2]) / 3;
  if (
    normalZ <= 0 ||
    averageZ < 0.05 ||
    !triangle.some((index) => inFrame(positions[index]))
  ) {
    continue;
  }
  frontTriangles.push(triangle);
  triangle.forEach((index) => {
    if (inFrame(positions[index])) {
      visibleVertices.add(index);
    }
  });
}

const edgeKeys = new Set();
frontTriangles.forEach((triangle) => {
  for (let index = 0; index < 3; index += 1) {
    const left = triangle[index];
    const right = triangle[(index + 1) % 3];
    edgeKeys.add(`${Math.min(left, right)}:${Math.max(left, right)}`);
  }
});
const edgeMarkup = [...edgeKeys]
  .map((key) => key.split(":").map(Number))
  .map(([left, right]) => {
    const [x1, y1] = project(positions[left]);
    const [x2, y2] = project(positions[right]);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  })
  .join("\n");
const labelMarkup = frame.labels
  ? [...visibleVertices]
      .sort((left, right) => positions[right][2] - positions[left][2])
      .slice(0, 180)
      .map((index) => {
        const [x, y] = project(positions[index]);
        return `<g><circle cx="${x}" cy="${y}" r="3.2"/><text x="${x + 5}" y="${y - 5}">${index}</text></g>`;
      })
      .join("\n")
  : "";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#050708"/>
<g stroke="#2c7779" stroke-width="1" stroke-opacity="0.7" fill="none">${edgeMarkup}</g>
<g fill="#7ef5f0" font-family="monospace" font-size="12">${labelMarkup}</g>
</svg>\n`;
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg);
console.log(JSON.stringify({ outputPath, feature, vertices: visibleVertices.size }));
