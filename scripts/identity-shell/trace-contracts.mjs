import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getIdentityShellDocument,
  readAccessor,
  readGlb,
} from "../shell/glb.mjs";
import { buildV2TraceContract } from "./build-v2-trace-samples.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");

const SEMANTIC_PATHS_V1 = [
  {
    id: "jaw",
    region: "jaw",
    palette: "violet",
    controls: [
      [-0.76, 0.02],
      [-0.8, -0.18],
      [-0.73, -0.42],
      [-0.57, -0.66],
      [-0.32, -0.87],
      [0, -0.98],
      [0.32, -0.87],
      [0.57, -0.66],
      [0.73, -0.42],
      [0.8, -0.18],
      [0.76, 0.02],
    ],
  },
  {
    id: "left-brow",
    region: "brows",
    palette: "cyan",
    controls: [
      [-0.62, 0.34],
      [-0.48, 0.43],
      [-0.32, 0.46],
      [-0.16, 0.39],
      [-0.08, 0.31],
    ],
  },
  {
    id: "right-brow",
    region: "brows",
    palette: "violet",
    controls: [
      [0.08, 0.31],
      [0.16, 0.39],
      [0.32, 0.46],
      [0.48, 0.43],
      [0.62, 0.34],
    ],
  },
  {
    id: "left-eye",
    region: "lids",
    palette: "cyan",
    closed: true,
    controls: [
      [-0.61, 0.16],
      [-0.47, 0.22],
      [-0.3, 0.21],
      [-0.15, 0.14],
      [-0.29, 0.09],
      [-0.47, 0.08],
    ],
  },
  {
    id: "right-eye",
    region: "lids",
    palette: "violet",
    closed: true,
    controls: [
      [0.15, 0.14],
      [0.3, 0.21],
      [0.47, 0.22],
      [0.61, 0.16],
      [0.47, 0.08],
      [0.29, 0.09],
    ],
  },
  {
    id: "nose-bridge",
    region: "nose",
    palette: "cyan",
    controls: [
      [0, 0.34],
      [0, 0.2],
      [0, 0.06],
      [0, -0.08],
    ],
  },
  {
    id: "nose-contour",
    region: "nose",
    palette: "violet",
    controls: [
      [-0.18, -0.08],
      [-0.22, -0.19],
      [-0.13, -0.27],
      [0, -0.25],
      [0.13, -0.27],
      [0.22, -0.19],
      [0.18, -0.08],
    ],
  },
  {
    id: "upper-lip",
    region: "lips",
    palette: "cyan",
    controls: [
      [-0.33, -0.42],
      [-0.18, -0.39],
      [0, -0.43],
      [0.18, -0.39],
      [0.33, -0.42],
    ],
  },
  {
    id: "lower-lip",
    region: "lips",
    palette: "violet",
    controls: [
      [-0.31, -0.43],
      [-0.17, -0.5],
      [0, -0.52],
      [0.17, -0.5],
      [0.31, -0.43],
    ],
  },
  {
    id: "left-cheek",
    region: "cheeks",
    palette: "cyan",
    emphasis: "secondary",
    controls: [
      [-0.65, 0.02],
      [-0.69, -0.15],
      [-0.61, -0.32],
      [-0.46, -0.43],
    ],
  },
  {
    id: "right-cheek",
    region: "cheeks",
    palette: "violet",
    emphasis: "secondary",
    controls: [
      [0.65, 0.02],
      [0.69, -0.15],
      [0.61, -0.32],
      [0.46, -0.43],
    ],
  },
];

const ASSETS = [
  {
    version: "1.0.0",
    traceSchemaVersion: "semantic-trace-v1",
    semanticPaths: SEMANTIC_PATHS_V1,
    meshName: "IdentityShell",
    glb: "assets/releases/identity-shell/1.0.0/identity-shell.glb",
    module: "assets/releases/identity-shell/1.0.0/module-manifest.json",
    copies: [
      "packages/manifest/asset-module.json",
      "manifests/identity-shell.module.json",
    ],
    frame: { xMin: -0.61, xMax: 0.61, yMin: -1.12, yMax: 0.72, front: -0.15 },
    normalOffset: 0.004,
  },
  {
    version: "2.0.0",
    traceSchemaVersion: "semantic-trace-v4",
    authoredTrace:
      "assets/candidates/identity-shell/2.0.0/trace-authoring.json",
    meshName: "FLAME2023Open",
    glb: "assets/candidates/identity-shell/2.0.0/identity-shell.glb",
    module: "assets/candidates/identity-shell/2.0.0/module-manifest.json",
    copies: [
      "../synmere/public/models/shell/identity-shell/2.0.0/module-manifest.json",
    ],
  },
];

const REGION_BOUNDS = {
  brows: { x: [-0.72, 0.72], y: [0.25, 0.55], front: 0.12 },
  lids: { x: [-0.7, 0.7], y: [0.0, 0.29], front: 0.16 },
  nose: { x: [-0.28, 0.28], y: [-0.34, 0.4], front: 0.22 },
  lips: { x: [-0.42, 0.42], y: [-0.59, -0.32], front: 0.18 },
  cheeks: { x: [-0.76, 0.76], y: [-0.5, 0.1], front: 0.08 },
  jaw: { x: [-0.86, 0.86], y: [-1.04, 0.1], front: 0.02 },
};

const REGION_CORRIDOR_WIDTH = {
  brows: 0.075,
  lids: 0.07,
  nose: 0.075,
  lips: 0.075,
  cheeks: 0.1,
  jaw: 0.12,
};

const normalizePosition = ([x, y], frame) => [
  ((x - frame.xMin) / (frame.xMax - frame.xMin)) * 2 - 1,
  ((y - frame.yMin) / (frame.yMax - frame.yMin)) * 2 - 1,
];

const targetPosition = ([x, y], frame) => [
  frame.xMin + ((x + 1) / 2) * (frame.xMax - frame.xMin),
  frame.yMin + ((y + 1) / 2) * (frame.yMax - frame.yMin),
];

const buildAdjacency = (positions, indices) => {
  const adjacency = Array.from({ length: positions.length }, () => new Map());
  const connect = (left, right) => {
    const a = positions[left];
    const b = positions[right];
    const weight = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    adjacency[left].set(right, weight);
    adjacency[right].set(left, weight);
  };
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    connect(a, b);
    connect(b, c);
    connect(c, a);
  }
  return adjacency;
};

class MinHeap {
  values = [];
  push(value) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].distance <= value.distance) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }
  pop() {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let index = 0;
    this.values[0] = last;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < this.values.length &&
        this.values[left].distance < this.values[smallest].distance
      ) {
        smallest = left;
      }
      if (
        right < this.values.length &&
        this.values[right].distance < this.values[smallest].distance
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.values[index], this.values[smallest]] = [
        this.values[smallest],
        this.values[index],
      ];
      index = smallest;
    }
    return first;
  }
}

const shortestPath = (start, end, allowed, adjacency) => {
  const distances = new Map([[start, 0]]);
  const previous = new Map();
  const queue = new MinHeap();
  queue.push({ vertex: start, distance: 0 });
  while (queue.values.length > 0) {
    const current = queue.pop();
    if (!current || current.distance !== distances.get(current.vertex)) {
      continue;
    }
    if (current.vertex === end) break;
    for (const [next, weight] of adjacency[current.vertex]) {
      if (!allowed.has(next)) continue;
      const distance = current.distance + weight;
      if (distance >= (distances.get(next) ?? Infinity)) continue;
      distances.set(next, distance);
      previous.set(next, current.vertex);
      queue.push({ vertex: next, distance });
    }
  }
  if (!distances.has(end)) {
    throw new Error(`No allowed topology path connects ${start} to ${end}.`);
  }
  const result = [end];
  while (result[0] !== start) result.unshift(previous.get(result[0]));
  return result;
};

const allowedVertices = (positions, frame, region) => {
  const bounds = REGION_BOUNDS[region];
  return new Set(
    positions.flatMap((position, index) => {
      const [x, y] = normalizePosition(position, frame);
      const minimumDepth = frame.front + bounds.front;
      return x >= bounds.x[0] &&
        x <= bounds.x[1] &&
        y >= bounds.y[0] &&
        y <= bounds.y[1] &&
        position[2] >= minimumDepth
        ? [index]
        : [];
    }),
  );
};

const nearestAllowedVertex = (positions, frame, control, allowed) => {
  const [targetX, targetY] = targetPosition(control, frame);
  let bestIndex;
  let bestDistance = Infinity;
  for (const index of allowed) {
    const position = positions[index];
    const distance =
      (position[0] - targetX) ** 2 + (position[1] - targetY) ** 2;
    if (
      distance < bestDistance ||
      (distance === bestDistance && position[2] > positions[bestIndex]?.[2])
    ) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  if (bestIndex === undefined) {
    throw new Error(`No allowed vertex for semantic control ${control}.`);
  }
  return bestIndex;
};

const connectedAllowedVertices = (start, allowed, adjacency) => {
  const connected = new Set([start]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of adjacency[queue[cursor]].keys()) {
      if (!allowed.has(neighbor) || connected.has(neighbor)) continue;
      connected.add(neighbor);
      queue.push(neighbor);
    }
  }
  return connected;
};

const distanceToControlSegment = (point, start, end) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    point[0] - (start[0] + dx * t),
    point[1] - (start[1] + dy * t),
  );
};

const routeControlSegment = ({
  start,
  end,
  startControl,
  endControl,
  connected,
  positions,
  frame,
  region,
  adjacency,
}) => {
  const baseWidth = REGION_CORRIDOR_WIDTH[region];
  for (const scale of [1, 1.5, 2, 3]) {
    const corridor = new Set(
      [...connected].filter((vertexIndex) => {
        return (
          vertexIndex === start ||
          vertexIndex === end ||
          distanceToControlSegment(
            normalizePosition(positions[vertexIndex], frame),
            startControl,
            endControl,
          ) <=
            baseWidth * scale
        );
      }),
    );
    try {
      return shortestPath(start, end, corridor, adjacency);
    } catch {
      // Expand only within the named anatomical region when a coarse edge ring
      // cannot fit inside the initial semantic corridor.
    }
  }
  return shortestPath(start, end, connected, adjacency);
};

const buildPath = (definition, positions, adjacency, frame) => {
  const allowed = allowedVertices(positions, frame, definition.region);
  const firstAnchor = nearestAllowedVertex(
    positions,
    frame,
    definition.controls[0],
    allowed,
  );
  const connected = connectedAllowedVertices(firstAnchor, allowed, adjacency);
  const controls = definition.closed
    ? [...definition.controls, definition.controls[0]]
    : [...definition.controls];
  const anchors = controls.map((control) =>
    nearestAllowedVertex(positions, frame, control, connected),
  );
  const vertexIndices = [];
  for (let index = 1; index < anchors.length; index += 1) {
    let segment;
    try {
      segment = routeControlSegment({
        start: anchors[index - 1],
        end: anchors[index],
        startControl: controls[index - 1],
        endControl: controls[index],
        connected,
        positions,
        frame,
        region: definition.region,
        adjacency,
      });
    } catch (error) {
      throw new Error(
        `${definition.id} control segment ${index - 1}-${index}: ${error.message}`,
      );
    }
    vertexIndices.push(...segment.slice(index === 1 ? 0 : 1));
  }
  const controlVertexIndices = definition.closed
    ? anchors.slice(0, -1)
    : anchors;
  const nodeVertexIndices = definition.nodeControlIndices
    ? definition.nodeControlIndices.map((index) => controlVertexIndices[index])
    : controlVertexIndices.filter(
        (_, index, values) =>
          index === 0 || index === values.length - 1 || index % 2 === 0,
      );
  const legacyPath = {
    id: definition.id,
    region: definition.region,
    palette: definition.palette,
    emphasis: definition.emphasis ?? "primary",
    closed: definition.closed ?? false,
    controlVertexIndices,
    nodeVertexIndices,
    vertexIndices,
  };
  if (!definition.role) {
    return legacyPath;
  }
  const accentSegments = (definition.accentSegmentControlRanges ?? []).map(
    ([startControlIndex, endControlIndex]) => {
      const startVertex = controlVertexIndices[startControlIndex];
      const endVertex = controlVertexIndices[endControlIndex];
      const startGuideIndex = vertexIndices.indexOf(startVertex);
      const endGuideIndex = vertexIndices.indexOf(endVertex, startGuideIndex);
      if (startGuideIndex < 0 || endGuideIndex < startGuideIndex) {
        throw new Error(
          `${definition.id} accent segment is outside its frozen guide path.`,
        );
      }
      return {
        controlVertexIndices: controlVertexIndices.slice(
          startControlIndex,
          endControlIndex + 1,
        ),
        guideVertexIndices: vertexIndices.slice(
          startGuideIndex,
          endGuideIndex + 1,
        ),
      };
    },
  );
  return {
    id: definition.id,
    region: definition.region,
    role: definition.role,
    closed: definition.closed ?? false,
    controlVertexIndices,
    nodeVertexIndices,
    accentNodeVertexIndices: (definition.accentNodeControlIndices ?? []).map(
      (index) => controlVertexIndices[index],
    ),
    accentSegments,
    guideVertexIndices: vertexIndices,
  };
};

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const buildAssetContract = async (asset) => {
  const glb = await readGlb(path.join(PROJECT_ROOT, asset.glb));
  const { primitive } = getIdentityShellDocument(glb, asset.meshName);
  const positions = readAccessor(glb, primitive.attributes.POSITION);
  const indices = readAccessor(glb, primitive.indices);
  const adjacency = buildAdjacency(positions, indices);
  let traceContract;
  if (asset.authoredTrace) {
    const authored = JSON.parse(
      await readFile(path.join(PROJECT_ROOT, asset.authoredTrace), "utf8"),
    );
    if (authored.referenceMesh !== asset.meshName) {
      throw new Error(`Invalid authored trace contract for ${asset.version}.`);
    }
    traceContract = buildV2TraceContract({
      authoring: authored,
      positions,
      indices,
    });
  } else {
    const paths = asset.semanticPaths.map((definition) =>
      buildPath(definition, positions, adjacency, asset.frame),
    );
    traceContract = {
      schemaVersion: asset.traceSchemaVersion,
      normalOffset: asset.normalOffset,
      paths,
    };
  }
  const modulePath = path.join(PROJECT_ROOT, asset.module);
  const moduleManifest = JSON.parse(await readFile(modulePath, "utf8"));
  moduleManifest.overlays = {
    trace: traceContract,
  };
  await writeJson(modulePath, moduleManifest);
  for (const copy of asset.copies) {
    const copyPath = copy.startsWith("..")
      ? path.resolve(PROJECT_ROOT, copy)
      : path.join(PROJECT_ROOT, copy);
    await writeJson(copyPath, moduleManifest);
  }
  return {
    version: asset.version,
    vertexCount: positions.length,
    pathCount: traceContract.paths.length,
    traceSampleCount: traceContract.paths.reduce(
      (total, item) =>
        total +
        (item.samples?.length ??
          item.vertexIndices?.length ??
          item.guideVertexIndices?.length ??
          0),
      0,
    ),
  };
};

const requestedVersion = process.argv.includes("--version")
  ? process.argv[process.argv.indexOf("--version") + 1]
  : undefined;
const selectedAssets = requestedVersion
  ? ASSETS.filter((asset) => asset.version === requestedVersion)
  : ASSETS;
if (selectedAssets.length === 0)
  throw new Error(`Unknown Identity Shell version ${requestedVersion}.`);
const results = [];
for (const asset of selectedAssets)
  results.push(await buildAssetContract(asset));
console.log(JSON.stringify({ status: "generated", assets: results }, null, 2));
