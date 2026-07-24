import { readFile } from "node:fs/promises";

var sourcePath = process.argv[2];

if (!sourcePath) {
  throw new Error("Pass the MakeHuman base.obj path.");
}

var source = await readFile(sourcePath, "utf8");
var vertices = [];
var bodyFaces = [];
var activeGroup = "";

source.split(/\r?\n/u).forEach((line) => {
  if (line.startsWith("v ")) {
    var [, x, y, z] = line.trim().split(/\s+/u);
    vertices.push([Number(x), Number(y), Number(z)]);
    return;
  }
  if (line.startsWith("g ")) {
    activeGroup = line.slice(2).trim();
    return;
  }
  if (activeGroup === "body" && line.startsWith("f ")) {
    bodyFaces.push(
      line
        .slice(2)
        .trim()
        .split(/\s+/u)
        .map((value) => Number(value.split("/")[0]) - 1),
    );
  }
});

var bodyVertexIndices = new Set(bodyFaces.flat());
var bodyVertices = [...bodyVertexIndices].map((index) => vertices[index]);
var headVertices = bodyVertices.filter(([, y]) => y >= 5.8);
var ranges = ["x", "y", "z"].map((axis, axisIndex) => {
  var values = headVertices.map((vertex) => vertex[axisIndex]);
  return {
    axis,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
});
var depthBins = Array.from({ length: 12 }, (_, index) => {
  var minimum = -0.2 + index * 0.15;
  var maximum = minimum + 0.15;
  return {
    range: [minimum, maximum],
    count: headVertices.filter(([, , z]) => z >= minimum && z < maximum).length,
  };
});
var faceCandidates = bodyVertices.filter(([x, y]) => {
  var normalizedX = x / 0.78;
  var normalizedY = (y - 7.35) / 1.18;
  return normalizedX ** 2 + normalizedY ** 2 <= 1;
});
var sortedFaceDepths = faceCandidates
  .map(([, , z]) => z)
  .sort((left, right) => left - right);
var quantile = (values, position) => {
  return values[Math.floor((values.length - 1) * position)];
};

console.log(
  JSON.stringify(
    {
      vertexCount: vertices.length,
      bodyVertexCount: bodyVertices.length,
      bodyFaceCount: bodyFaces.length,
      headVertexCount: headVertices.length,
      ranges,
      depthBins,
      faceCandidateCount: faceCandidates.length,
      faceDepthQuantiles: {
        minimum: quantile(sortedFaceDepths, 0),
        q10: quantile(sortedFaceDepths, 0.1),
        q25: quantile(sortedFaceDepths, 0.25),
        median: quantile(sortedFaceDepths, 0.5),
        q75: quantile(sortedFaceDepths, 0.75),
        q90: quantile(sortedFaceDepths, 0.9),
        maximum: quantile(sortedFaceDepths, 1),
      },
    },
    null,
    2,
  ),
);
