import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BINARY_CHUNK_TYPE = 0x004e4942;

const COMPONENT_TYPE = {
  BYTE: 5120,
  UNSIGNED_BYTE: 5121,
  SHORT: 5122,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  FLOAT: 5126,
};

const TYPE_COMPONENT_COUNT = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

const getComponentByteSize = (componentType) => {
  if (
    componentType === COMPONENT_TYPE.BYTE ||
    componentType === COMPONENT_TYPE.UNSIGNED_BYTE
  ) {
    return 1;
  }
  if (
    componentType === COMPONENT_TYPE.SHORT ||
    componentType === COMPONENT_TYPE.UNSIGNED_SHORT
  ) {
    return 2;
  }
  return 4;
};

const readComponent = (buffer, offset, componentType) => {
  if (componentType === COMPONENT_TYPE.BYTE) {
    return buffer.readInt8(offset);
  }
  if (componentType === COMPONENT_TYPE.UNSIGNED_BYTE) {
    return buffer.readUInt8(offset);
  }
  if (componentType === COMPONENT_TYPE.SHORT) {
    return buffer.readInt16LE(offset);
  }
  if (componentType === COMPONENT_TYPE.UNSIGNED_SHORT) {
    return buffer.readUInt16LE(offset);
  }
  if (componentType === COMPONENT_TYPE.UNSIGNED_INT) {
    return buffer.readUInt32LE(offset);
  }
  if (componentType === COMPONENT_TYPE.FLOAT) {
    return buffer.readFloatLE(offset);
  }
  throw new Error(`Unsupported GLB component type: ${componentType}`);
};

const padBuffer = (buffer, paddingByte) => {
  const paddingLength = (4 - (buffer.length % 4)) % 4;
  if (paddingLength === 0) {
    return buffer;
  }
  return Buffer.concat([buffer, Buffer.alloc(paddingLength, paddingByte)]);
};

export const sha256Buffer = (buffer) => {
  return createHash("sha256").update(buffer).digest("hex");
};

export const sha256File = async (filePath) => {
  return sha256Buffer(await readFile(filePath));
};

export const readGlb = async (filePath) => {
  const source = await readFile(filePath);
  if (source.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${filePath} is not a binary glTF asset.`);
  }
  if (source.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error(`${filePath} does not use glTF 2.0.`);
  }

  const chunks = [];
  let offset = 12;
  while (offset < source.length) {
    const byteLength = source.readUInt32LE(offset);
    const type = source.readUInt32LE(offset + 4);
    const data = source.subarray(offset + 8, offset + 8 + byteLength);
    chunks.push({ type, data });
    offset += 8 + byteLength;
  }

  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK_TYPE);
  const binaryChunk = chunks.find((chunk) => chunk.type === BINARY_CHUNK_TYPE);
  if (!jsonChunk || !binaryChunk) {
    throw new Error(`${filePath} is missing its JSON or binary GLB chunk.`);
  }

  return {
    filePath,
    json: JSON.parse(jsonChunk.data.toString().trim()),
    binary: binaryChunk.data,
    chunks,
  };
};

export const writeGlb = async (filePath, glb) => {
  const json = padBuffer(Buffer.from(JSON.stringify(glb.json)), 0x20);
  const binary = padBuffer(glb.binary, 0);
  const totalLength = 12 + 8 + json.length + 8 + binary.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(GLB_VERSION, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK_TYPE, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(BINARY_CHUNK_TYPE, 4);

  await writeFile(
    filePath,
    Buffer.concat([header, jsonHeader, json, binaryHeader, binary]),
  );
};

export const readAccessor = (glb, accessorIndex) => {
  const accessor = glb.json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`Missing accessor ${accessorIndex}.`);
  }

  const componentCount = TYPE_COMPONENT_COUNT[accessor.type];
  if (!componentCount) {
    throw new Error(`Unsupported accessor type: ${accessor.type}`);
  }
  const componentByteSize = getComponentByteSize(accessor.componentType);
  const packedByteLength = componentCount * componentByteSize;
  const createElement = (elementOffset) => {
    const components = [];
    for (let component = 0; component < componentCount; component += 1) {
      components.push(
        readComponent(
          glb.binary,
          elementOffset + component * componentByteSize,
          accessor.componentType,
        ),
      );
    }
    return componentCount === 1 ? components[0] : components;
  };
  const emptyElement = () => {
    return componentCount === 1
      ? 0
      : Array.from({ length: componentCount }, () => 0);
  };
  const values = Array.from({ length: accessor.count }, emptyElement);

  if (accessor.bufferView !== undefined) {
    const bufferView = glb.json.bufferViews?.[accessor.bufferView];
    if (!bufferView) {
      throw new Error(`Missing buffer view for accessor ${accessorIndex}.`);
    }
    const stride = bufferView.byteStride ?? packedByteLength;
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let index = 0; index < accessor.count; index += 1) {
      values[index] = createElement(start + index * stride);
    }
  }

  if (accessor.sparse) {
    const sparseIndices = accessor.sparse.indices;
    const sparseValues = accessor.sparse.values;
    const indicesBufferView = glb.json.bufferViews?.[sparseIndices.bufferView];
    const valuesBufferView = glb.json.bufferViews?.[sparseValues.bufferView];
    if (!indicesBufferView || !valuesBufferView) {
      throw new Error(`Sparse accessor ${accessorIndex} is incomplete.`);
    }
    const indexByteSize = getComponentByteSize(sparseIndices.componentType);
    const indicesStart =
      (indicesBufferView.byteOffset ?? 0) + (sparseIndices.byteOffset ?? 0);
    const valuesStart =
      (valuesBufferView.byteOffset ?? 0) + (sparseValues.byteOffset ?? 0);

    for (
      let sparseIndex = 0;
      sparseIndex < accessor.sparse.count;
      sparseIndex += 1
    ) {
      const targetIndex = readComponent(
        glb.binary,
        indicesStart + sparseIndex * indexByteSize,
        sparseIndices.componentType,
      );
      values[targetIndex] = createElement(
        valuesStart + sparseIndex * packedByteLength,
      );
    }
  }
  return values;
};

export const getIdentityShellDocument = (glb, meshName) => {
  const nodeIndex = glb.json.nodes?.findIndex((node) => {
    return node.name === meshName;
  });
  if (nodeIndex === undefined || nodeIndex < 0) {
    throw new Error(`GLB does not contain the ${meshName} node.`);
  }
  const node = glb.json.nodes[nodeIndex];
  const mesh = glb.json.meshes?.[node.mesh];
  const primitive = mesh?.primitives?.[0];
  if (!mesh || !primitive) {
    throw new Error(`${meshName} does not contain a renderable mesh.`);
  }
  return { nodeIndex, node, mesh, primitive };
};

const createTopologyHash = (indices) => {
  const normalized = Buffer.alloc(indices.length * 4);
  indices.forEach((index, offset) => {
    normalized.writeUInt32LE(index, offset * 4);
  });
  return sha256Buffer(normalized);
};

const getBounds = (positions) => {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  positions.forEach((position) => {
    position.forEach((value, axis) => {
      minimum[axis] = Math.min(minimum[axis], value);
      maximum[axis] = Math.max(maximum[axis], value);
    });
  });
  return { minimum, maximum };
};

export const getGlbContract = (glb, meshName) => {
  const { node, mesh, primitive } = getIdentityShellDocument(glb, meshName);
  const positions = readAccessor(glb, primitive.attributes.POSITION);
  const indices = readAccessor(glb, primitive.indices);
  const materialName = glb.json.materials?.[primitive.material]?.name ?? null;
  const morphTargetNames = mesh.extras?.targetNames ?? [];
  return {
    meshName: node.name,
    materialName,
    vertexCount: positions.length,
    indexCount: indices.length,
    triangleCount: indices.length / 3,
    topologyHash: createTopologyHash(indices),
    morphTargetNames,
    morphTargetCount: primitive.targets?.length ?? 0,
    bounds: getBounds(positions),
  };
};

const getEdges = (indices) => {
  const edges = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [
      indices[offset],
      indices[offset + 1],
      indices[offset + 2],
    ];
    for (let edge = 0; edge < 3; edge += 1) {
      const start = triangle[edge];
      const end = triangle[(edge + 1) % 3];
      const minimum = Math.min(start, end);
      const maximum = Math.max(start, end);
      edges.set(`${minimum}:${maximum}`, [minimum, maximum]);
    }
  }
  return [...edges.values()];
};

const distance = (left, right) => {
  return Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2]);
};

const normalize = (vector) => {
  const magnitude = Math.hypot(...vector);
  if (magnitude === 0) {
    return [0, 0, 1];
  }
  return vector.map((value) => value / magnitude);
};

const computeVertexNormals = (positions, indices) => {
  const normals = positions.map(() => [0, 0, 0]);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const first = indices[offset];
    const second = indices[offset + 1];
    const third = indices[offset + 2];
    const left = [
      positions[second][0] - positions[first][0],
      positions[second][1] - positions[first][1],
      positions[second][2] - positions[first][2],
    ];
    const right = [
      positions[third][0] - positions[first][0],
      positions[third][1] - positions[first][1],
      positions[third][2] - positions[first][2],
    ];
    const faceNormal = [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0],
    ];
    [first, second, third].forEach((index) => {
      normals[index][0] += faceNormal[0];
      normals[index][1] += faceNormal[1];
      normals[index][2] += faceNormal[2];
    });
  }
  return normals.map(normalize);
};

const createFloatVectorBuffer = (vectors) => {
  const buffer = Buffer.alloc(vectors.length * 3 * 4);
  vectors.forEach((vector, index) => {
    vector.forEach((value, axis) => {
      buffer.writeFloatLE(value, (index * 3 + axis) * 4);
    });
  });
  return buffer;
};

export const appendMorphNormals = (glb, meshName, maximumNormalDelta) => {
  const { primitive } = getIdentityShellDocument(glb, meshName);
  const positions = readAccessor(glb, primitive.attributes.POSITION);
  const baseNormals = readAccessor(glb, primitive.attributes.NORMAL);
  const indices = readAccessor(glb, primitive.indices);
  const computedBaseNormals = computeVertexNormals(positions, indices);
  const averageOrientation = computedBaseNormals.reduce(
    (total, normal, index) => {
      return (
        total +
        normal[0] * baseNormals[index][0] +
        normal[1] * baseNormals[index][1] +
        normal[2] * baseNormals[index][2]
      );
    },
    0,
  );
  const orientation = averageOrientation >= 0 ? 1 : -1;

  (primitive.targets ?? []).forEach((target) => {
    const positionDeltas = readAccessor(glb, target.POSITION);
    const targetPositions = positions.map((position, index) => {
      return position.map((value, axis) => {
        return value + positionDeltas[index][axis];
      });
    });
    const targetNormals = computeVertexNormals(targetPositions, indices);
    const normalDeltas = targetNormals.map((normal, index) => {
      const delta = normal.map((value, axis) => {
        return value * orientation - baseNormals[index][axis];
      });
      const magnitude = Math.hypot(...delta);
      const scale =
        magnitude > maximumNormalDelta ? maximumNormalDelta / magnitude : 1;
      return delta.map((value) => value * scale);
    });
    const normalBuffer = createFloatVectorBuffer(normalDeltas);
    const byteOffset = glb.binary.length;
    glb.binary = Buffer.concat([glb.binary, normalBuffer]);
    const bufferViewIndex = glb.json.bufferViews.length;
    glb.json.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: normalBuffer.length,
    });
    const accessorIndex = glb.json.accessors.length;
    glb.json.accessors.push({
      bufferView: bufferViewIndex,
      componentType: COMPONENT_TYPE.FLOAT,
      count: normalDeltas.length,
      type: "VEC3",
    });
    target.NORMAL = accessorIndex;
  });
  glb.json.buffers[0].byteLength = glb.binary.length;
};

export const computeMorphIntegrity = (
  glb,
  meshName,
  minimumMorphEdgeDelta,
  maximumMorphEdgeStrain,
) => {
  const { mesh, primitive } = getIdentityShellDocument(glb, meshName);
  const positions = readAccessor(glb, primitive.attributes.POSITION);
  const indices = readAccessor(glb, primitive.indices);
  const edges = getEdges(indices);
  const morphTargetNames = mesh.extras?.targetNames ?? [];
  const minimumEffectiveLength = minimumMorphEdgeDelta / maximumMorphEdgeStrain;

  return Object.fromEntries(
    (primitive.targets ?? []).map((target, targetIndex) => {
      const deltas = readAccessor(glb, target.POSITION);
      const maximumEdgeStrain = edges.reduce((maximum, [start, end]) => {
        const effectiveEdgeLength = Math.max(
          distance(positions[start], positions[end]),
          minimumEffectiveLength,
        );
        const deltaDifference = distance(deltas[start], deltas[end]);
        return Math.max(maximum, deltaDifference / effectiveEdgeLength);
      }, 0);
      return [
        morphTargetNames[targetIndex] ?? `target-${targetIndex}`,
        {
          maximumEdgeStrain: Number(maximumEdgeStrain.toFixed(5)),
        },
      ];
    }),
  );
};

export const getNodeExtras = (glb, meshName) => {
  return getIdentityShellDocument(glb, meshName).node.extras ?? {};
};

export const setNodeExtras = (glb, meshName, extras) => {
  getIdentityShellDocument(glb, meshName).node.extras = extras;
};
