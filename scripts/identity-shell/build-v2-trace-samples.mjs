const add = (left, right) => left.map((value, index) => value + right[index]);
const subtract = (left, right) =>
  left.map((value, index) => value - right[index]);
const scale = (vector, scalar) => vector.map((value) => value * scalar);
const dot = (left, right) =>
  left.reduce((total, value, index) => total + value * right[index], 0);
const distance = (left, right) => Math.hypot(...subtract(left, right));
const lerp = (left, right, amount) =>
  left.map((value, index) => value + (right[index] - value) * amount);

const triangleVertices = (triangleIndex, indices) => {
  const offset = triangleIndex * 3;
  return [indices[offset], indices[offset + 1], indices[offset + 2]];
};

const reconstructSample = (sample, positions, indices) => {
  const vertices = triangleVertices(sample.triangleIndex, indices);
  return sample.barycentric.reduce(
    (point, weight, index) =>
      add(point, scale(positions[vertices[index]], weight)),
    [0, 0, 0],
  );
};

const interpolateCentripetal = (p0, p1, p2, p3, amount) => {
  const alpha = 0.5;
  const nextKnot = (previous, left, right) =>
    previous + Math.max(distance(left, right) ** alpha, 1e-6);
  const t0 = 0;
  const t1 = nextKnot(t0, p0, p1);
  const t2 = nextKnot(t1, p1, p2);
  const t3 = nextKnot(t2, p2, p3);
  const t = t1 + (t2 - t1) * amount;
  const blend = (left, right, leftTime, rightTime) =>
    add(
      scale(left, (rightTime - t) / (rightTime - leftTime)),
      scale(right, (t - leftTime) / (rightTime - leftTime)),
    );
  const a1 = blend(p0, p1, t0, t1);
  const a2 = blend(p1, p2, t1, t2);
  const a3 = blend(p2, p3, t2, t3);
  const b1 = add(
    scale(a1, (t2 - t) / (t2 - t0)),
    scale(a2, (t - t0) / (t2 - t0)),
  );
  const b2 = add(
    scale(a2, (t3 - t) / (t3 - t1)),
    scale(a3, (t - t1) / (t3 - t1)),
  );
  return add(scale(b1, (t2 - t) / (t2 - t1)), scale(b2, (t - t1) / (t2 - t1)));
};

const sampleAuthoredCurve = (anchors, closed) => {
  const curve = [];
  const segmentCount = closed ? anchors.length : anchors.length - 1;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const index = (offset) => {
      if (closed) return (segment + offset + anchors.length) % anchors.length;
      return Math.max(0, Math.min(anchors.length - 1, segment + offset));
    };
    const points = [index(-1), index(0), index(1), index(2)].map(
      (anchorIndex) => anchors[anchorIndex],
    );
    for (let sample = 0; sample < 32; sample += 1) {
      curve.push(interpolateCentripetal(...points, sample / 32));
    }
  }
  if (!closed) curve.push(anchors.at(-1));
  return curve;
};

const resampleUniformly = (points, spacing, closed) => {
  const source = closed ? [...points, points[0]] : points;
  const cumulative = [0];
  for (let index = 1; index < source.length; index += 1) {
    cumulative.push(
      cumulative.at(-1) + distance(source[index - 1], source[index]),
    );
  }
  const totalLength = cumulative.at(-1);
  const segmentCount = Math.max(2, Math.ceil(totalLength / spacing));
  const sampleCount = closed ? segmentCount : segmentCount + 1;
  let sourceIndex = 1;
  return Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const targetDistance = (sampleIndex / segmentCount) * totalLength;
    while (
      sourceIndex < cumulative.length - 1 &&
      cumulative[sourceIndex] < targetDistance
    ) {
      sourceIndex += 1;
    }
    const startDistance = cumulative[sourceIndex - 1];
    const endDistance = cumulative[sourceIndex];
    const amount =
      endDistance === startDistance
        ? 0
        : (targetDistance - startDistance) / (endDistance - startDistance);
    return lerp(source[sourceIndex - 1], source[sourceIndex], amount);
  });
};

const closestPointBarycentric = (point, a, b, c) => {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const ap = subtract(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];

  const bp = subtract(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const weight = d1 / (d1 - d3);
    return [1 - weight, weight, 0];
  }

  const cp = subtract(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const weight = d2 / (d2 - d6);
    return [1 - weight, 0, weight];
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const weight = (d4 - d3) / (d4 - d3 + d5 - d6);
    return [0, 1 - weight, weight];
  }

  const denominator = 1 / (va + vb + vc);
  const bWeight = vb * denominator;
  const cWeight = vc * denominator;
  return [1 - bWeight - cWeight, bWeight, cWeight];
};

const buildTriangleAdjacency = (indices) => {
  const edgeTriangles = new Map();
  const triangleCount = indices.length / 3;
  for (
    let triangleIndex = 0;
    triangleIndex < triangleCount;
    triangleIndex += 1
  ) {
    const vertices = triangleVertices(triangleIndex, indices);
    for (let index = 0; index < 3; index += 1) {
      const left = vertices[index];
      const right = vertices[(index + 1) % 3];
      const key = `${Math.min(left, right)}:${Math.max(left, right)}`;
      const triangles = edgeTriangles.get(key) ?? [];
      triangles.push(triangleIndex);
      edgeTriangles.set(key, triangles);
    }
  }
  const adjacency = Array.from({ length: triangleCount }, () => new Set());
  edgeTriangles.forEach((triangles) => {
    triangles.forEach((triangle) => {
      triangles.forEach((neighbor) => {
        if (triangle !== neighbor) adjacency[triangle].add(neighbor);
      });
    });
  });
  return adjacency;
};

const expandTriangleCorridor = (
  anchors,
  rings,
  adjacency,
  indices,
  positions,
  excludedVertexIndices = [],
  regionBounds,
) => {
  const excludedVertices = new Set(excludedVertexIndices);
  const isAllowed = (triangleIndex) => {
    const vertices = triangleVertices(triangleIndex, indices);
    if (vertices.some((vertexIndex) => excludedVertices.has(vertexIndex))) {
      return false;
    }
    if (!regionBounds) {
      return true;
    }
    const centroid = vertices
      .map((vertexIndex) => positions[vertexIndex])
      .reduce(
        (resolved, point) => add(resolved, scale(point, 1 / 3)),
        [0, 0, 0],
      );
    return ["x", "y", "z"].every((axis, index) => {
      const bounds = regionBounds[axis];
      return (
        !bounds ||
        (centroid[index] >= bounds[0] && centroid[index] <= bounds[1])
      );
    });
  };
  if (anchors.some((anchor) => !isAllowed(anchor.triangleIndex))) {
    throw new Error("A trace anchor lies outside its authored surface region.");
  }
  const corridor = new Set(anchors.map((anchor) => anchor.triangleIndex));
  let frontier = new Set(corridor);
  for (let ring = 0; ring < rings; ring += 1) {
    const next = new Set();
    frontier.forEach((triangle) => {
      adjacency[triangle].forEach((neighbor) => {
        if (!corridor.has(neighbor) && isAllowed(neighbor)) next.add(neighbor);
      });
    });
    next.forEach((triangle) => corridor.add(triangle));
    frontier = next;
  }
  return [...corridor].sort((left, right) => left - right);
};

const shrinkwrapPoint = (point, corridor, positions, indices) => {
  let closest;
  let closestDistance = Infinity;
  corridor.forEach((triangleIndex) => {
    const vertices = triangleVertices(triangleIndex, indices);
    const barycentric = closestPointBarycentric(
      point,
      ...vertices.map((vertexIndex) => positions[vertexIndex]),
    );
    const sample = { triangleIndex, barycentric };
    const projected = reconstructSample(sample, positions, indices);
    const candidateDistance = distance(point, projected);
    if (candidateDistance < closestDistance) {
      closestDistance = candidateDistance;
      closest = sample;
    }
  });
  return closest;
};

const roundSample = (sample) => ({
  triangleIndex: sample.triangleIndex,
  barycentric: sample.barycentric.map((weight) => Number(weight.toFixed(8))),
});

const samplesMatch = (left, right) =>
  left.triangleIndex === right.triangleIndex &&
  left.barycentric.every(
    (weight, index) => weight === right.barycentric[index],
  );

const dedupeSamples = (samples, closed) => {
  const deduped = samples.filter(
    (sample, index) => index === 0 || !samplesMatch(sample, samples[index - 1]),
  );
  if (
    closed &&
    deduped.length > 1 &&
    samplesMatch(deduped[0], deduped.at(-1))
  ) {
    deduped.pop();
  }
  return deduped;
};

export const buildV2TraceContract = ({ authoring, positions, indices }) => {
  if (authoring.schemaVersion !== "synmere.identity-shell.trace-authoring.v2") {
    throw new Error("V2 trace authoring must use the dense surface v2 schema.");
  }
  const adjacency = buildTriangleAdjacency(indices);
  const paths = authoring.paths.map((path) => {
    const anchorPoints = path.anchors.map((anchor) =>
      reconstructSample(anchor, positions, indices),
    );
    const authoredCurve = sampleAuthoredCurve(anchorPoints, path.closed);
    const uniformPoints = resampleUniformly(
      authoredCurve,
      path.sampleSpacing,
      path.closed,
    );
    const corridor = expandTriangleCorridor(
      path.anchors,
      path.corridorRings,
      adjacency,
      indices,
      positions,
      path.excludedVertexIndices,
      path.regionBounds,
    );
    const samples = uniformPoints.map((point) =>
      shrinkwrapPoint(point, corridor, positions, indices),
    );
    if (!path.closed) {
      samples[0] = path.anchors[0];
      samples[samples.length - 1] = path.anchors.at(-1);
    }
    return {
      id: path.id,
      closed: path.closed,
      ...(path.emphasis ? { emphasis: path.emphasis } : {}),
      samples: dedupeSamples(samples.map(roundSample), path.closed),
    };
  });
  return {
    schemaVersion: "semantic-trace-v4",
    surfaceOffset: authoring.surfaceOffset,
    paths,
    nodes: (authoring.nodes ?? []).map((node) => ({
      id: node.id,
      role: node.role,
      sample: roundSample(node.sample),
    })),
  };
};
