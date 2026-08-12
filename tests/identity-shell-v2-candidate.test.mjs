import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getIdentityShellDocument,
  readAccessor,
  readGlb,
} from "../scripts/shell/glb.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const readGlbTargetNames = async (path) => {
  const glb = await readFile(path);
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  const jsonLength = glb.readUInt32LE(12);
  const document = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
  return document.meshes[0].extras.targetNames;
};

test("registers v2 as a neutral FLAME candidate without replacing v1 production", async () => {
  const [candidate, production] = await Promise.all([
    readJson("assets/candidates/identity-shell/2.0.0/candidate-manifest.json"),
    readJson("manifests/identity-shell.current.json"),
  ]);

  assert.equal(candidate.releaseTag, "identity-shell-v2.0.0");
  assert.equal(candidate.stage, "candidate");
  assert.equal(candidate.topologyVersion, "flame-2023-open");
  assert.equal(candidate.contract.vertexCount, 5_023);
  assert.equal(candidate.contract.triangleCount, 9_976);
  assert.equal(candidate.contract.materialName, "IdentityShellClay");
  assert.match(candidate.contract.topologySha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    candidate.variants.map((variant) => variant.id),
    ["baseline", "oval", "broad", "long", "round", "heart", "diamond"],
  );
  assert.ok(
    candidate.variants.every(
      (variant) => variant.presentation.type === "parameter-preset",
    ),
  );
  assert.deepEqual(
    candidate.variants.map((variant) => variant.presentation.parameterPresetId),
    ["baseline", "oval", "broad", "long", "round", "heart", "diamond"],
  );
  assert.equal(
    candidate.glb.publicPath,
    "/models/shell/identity-shell/2.0.0/identity-shell.glb",
  );
  assert.equal(
    candidate.modulePublicPath,
    "/models/shell/identity-shell/2.0.0/module-manifest.json",
  );
  assert.equal(candidate.contract.morphTargetNames.length, 36);
  assert.deepEqual(candidate.contract.morphTargetNames.slice(-2), [
    "presentation_structure_structured",
    "presentation_structure_soft",
  ]);
  assert.equal(candidate.contract.identityMorphTargetCount, 34);
  assert.equal(candidate.contract.structureMorphTargetCount, 2);
  assert.equal(
    candidate.contract.identityMorphDeltaSha256,
    "12ceec23bf852ed53ff3d88ffb08690a32c32b4a0db9fc41ff11ec16677b20ba",
  );
  assert.equal(candidate.validation.status, "passed");
  assert.equal(candidate.validation.combinationCount, 21);
  assert.match(candidate.validation.reportSha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.provenance.license.declaredLicense, "CC-BY-4.0");

  const module = await readJson(
    "assets/candidates/identity-shell/2.0.0/module-manifest.json",
  );
  assert.deepEqual(module.presets.shape[0].parameters, {});
  assert.equal(module.presets.shape[0].baseParameters, "neutral");
  assert.ok(
    module.presets.shape.slice(1).every((preset) => {
      return (
        preset.baseParameters === "neutral" &&
        Object.keys(preset.parameters).length > 0
      );
    }),
  );
  assert.ok(module.parameters.assetBounds);
  assert.ok(module.parameters.designBounds);
  assert.equal("safeRanges" in module.parameters, false);
  assert.equal("authoringRanges" in module.parameters, false);
  assert.deepEqual(module.morphs.corrective, []);
  assert.deepEqual(
    module.presets.structure.map((preset) => preset.id),
    ["balanced", "structured", "soft"],
  );
  assert.deepEqual(module.presets.structure[0].morphWeights, {});
  assert.deepEqual(module.presets.structure[1].morphWeights, {
    presentation_structure_structured: 1,
  });
  assert.deepEqual(module.presets.structure[2].morphWeights, {
    presentation_structure_soft: 1,
  });
  assert.deepEqual(module.morphs.presentation, [
    {
      preset: "structured",
      target: "presentation_structure_structured",
    },
    { preset: "soft", target: "presentation_structure_soft" },
  ]);
  assert.equal(module.assetBounds.maximumCombinedStructureWeight, 1);
  assert.equal(module.designBounds.maximumCombinedStructureWeight, 1);

  assert.equal(production.releaseTag, "identity-shell-v1.0.0");
  assert.equal(production.stage, "production");
});

test("passes every structure and shape combination", async () => {
  const report = await readJson(
    "assets/candidates/identity-shell/2.0.0/combination-validation.json",
  );

  assert.equal(report.status, "passed");
  assert.equal(report.combinationCount, 21);
  assert.equal(report.structurePresetCount, 3);
  assert.equal(report.shapePresetCount, 7);
  assert.deepEqual(report.failedCombinationIds, []);
  assert.ok(
    report.combinations.every((combination) => {
      return (
        combination.status === "passed" &&
        combination.invertedTriangleCount === 0 &&
        combination.degenerateTriangleCount === 0 &&
        Object.keys(combination.regions).join(",") ===
          "jaw,cheeks,ears,neck,eyelids"
      );
    }),
  );
});

test("pairs each shell GLB with its own module contract", async () => {
  const [v1Module, v2Module, v1Targets, v2Targets] = await Promise.all([
    readJson("assets/releases/identity-shell/1.0.0/module-manifest.json"),
    readJson("assets/candidates/identity-shell/2.0.0/module-manifest.json"),
    readGlbTargetNames(
      "assets/releases/identity-shell/1.0.0/identity-shell.glb",
    ),
    readGlbTargetNames(
      "assets/candidates/identity-shell/2.0.0/identity-shell.glb",
    ),
  ]);

  assert.deepEqual(v1Targets, v1Module.morphs.targetNames);
  assert.deepEqual(v2Targets, v2Module.morphs.targetNames);
  assert.notDeepEqual(v1Targets, v2Module.morphs.targetNames);
  assert.notDeepEqual(v2Targets, v1Module.morphs.targetNames);
  assert.equal(
    v1Module.viewer.cameraFramingContract,
    v2Module.viewer.cameraFramingContract,
  );
});

test("owns valid frozen semantic trace paths for both shell topologies", async () => {
  const assets = [
    {
      glbPath: "assets/releases/identity-shell/1.0.0/identity-shell.glb",
      meshName: "IdentityShell",
      modulePath: "assets/releases/identity-shell/1.0.0/module-manifest.json",
    },
    {
      glbPath: "assets/candidates/identity-shell/2.0.0/identity-shell.glb",
      meshName: "FLAME2023Open",
      modulePath: "assets/candidates/identity-shell/2.0.0/module-manifest.json",
    },
  ];
  const expectedRegions = new Set([
    "brows",
    "lids",
    "nose",
    "lips",
    "cheeks",
    "jaw",
  ]);

  for (const asset of assets) {
    const [glb, module] = await Promise.all([
      readGlb(asset.glbPath),
      readJson(asset.modulePath),
    ]);
    const { primitive } = getIdentityShellDocument(glb, asset.meshName);
    const positions = readAccessor(glb, primitive.attributes.POSITION);
    const indices = readAccessor(glb, primitive.indices);
    const edges = new Set();
    for (let offset = 0; offset < indices.length; offset += 3) {
      const triangle = indices.slice(offset, offset + 3);
      for (let edge = 0; edge < 3; edge += 1) {
        const left = triangle[edge];
        const right = triangle[(edge + 1) % 3];
        edges.add(`${Math.min(left, right)}:${Math.max(left, right)}`);
      }
    }

    const trace = module.overlays.trace;
    const isBarycentricTrace = trace.schemaVersion === "semantic-trace-v4";
    assert.equal(
      trace.schemaVersion,
      asset.meshName === "FLAME2023Open"
        ? "semantic-trace-v4"
        : "semantic-trace-v1",
    );
    assert.equal(trace.paths.length, isBarycentricTrace ? 17 : 11);
    if (isBarycentricTrace) {
      assert.ok(trace.surfaceOffset > 0);
      assert.deepEqual(
        new Set(trace.paths.map((path) => path.id)),
        new Set([
          "left-lower-eyelid",
          "left-upper-eyelid",
          "right-lower-eyelid",
          "right-upper-eyelid",
          "left-brow-ridge",
          "right-brow-ridge",
          "left-cheekbone",
          "right-cheekbone",
          "left-temple-to-cheek",
          "right-temple-to-cheek",
          "philtrum-centerline",
          "chin-centerline",
          "outer-lip",
          "nose-bridge",
          "left-nose-wing",
          "right-nose-wing",
          "jaw",
        ]),
      );
      assert.equal(trace.nodes.length, 11);
      assert.deepEqual(
        new Set(trace.nodes.map((node) => node.id)),
        new Set([
          "left-inner-eye-corner",
          "left-outer-eye-corner",
          "right-inner-eye-corner",
          "right-outer-eye-corner",
          "left-nose-wing",
          "right-nose-wing",
          "left-mouth-corner",
          "right-mouth-corner",
          "left-jaw-angle",
          "right-jaw-angle",
          "chin",
        ]),
      );
      assert.deepEqual(
        new Set(
          trace.nodes
            .filter((node) => node.role === "accent")
            .map((node) => node.id),
        ),
        new Set([
          "left-outer-eye-corner",
          "right-outer-eye-corner",
          "left-nose-wing",
          "right-nose-wing",
          "left-jaw-angle",
          "right-jaw-angle",
        ]),
      );
      trace.nodes.forEach((node) => {
        assert.ok(["normal", "accent"].includes(node.role));
        assert.ok(Number.isSafeInteger(node.sample.triangleIndex));
        assert.ok(node.sample.triangleIndex >= 0);
        assert.ok(node.sample.triangleIndex * 3 + 2 < indices.length);
        assert.equal(node.sample.barycentric.length, 3);
        assert.ok(
          node.sample.barycentric.every((weight) => weight >= 0 && weight <= 1),
        );
        assert.ok(
          Math.abs(
            node.sample.barycentric.reduce(
              (total, weight) => total + weight,
              0,
            ) - 1,
          ) < 1e-6,
        );
        const owningPath = trace.paths.find((path) =>
          path.samples.some(
            (sample) => JSON.stringify(sample) === JSON.stringify(node.sample),
          ),
        );
        assert.ok(owningPath, `${node.id} must use an accepted path sample`);
        assert.notEqual(owningPath.emphasis, "secondary");
      });
    } else {
      assert.ok(trace.normalOffset > 0);
      assert.deepEqual(
        new Set(trace.paths.map((path) => path.region)),
        expectedRegions,
      );
    }
    for (const path of trace.paths) {
      if (!isBarycentricTrace) {
        assert.ok(["cyan", "violet"].includes(path.palette));
        assert.ok(["primary", "secondary"].includes(path.emphasis));
        assert.ok(
          path.vertexIndices.length >= path.controlVertexIndices.length,
        );
        for (let index = 1; index < path.vertexIndices.length; index += 1) {
          const left = path.vertexIndices[index - 1];
          const right = path.vertexIndices[index];
          assert.ok(
            edges.has(`${Math.min(left, right)}:${Math.max(left, right)}`),
            `${asset.meshName}/${path.id} leaves the mesh edge graph`,
          );
        }
        continue;
      }
      assert.ok(path.samples.length >= 20);
      assert.equal(path.vertexIndices, undefined);
      path.samples.forEach((sample, sampleIndex) => {
        assert.ok(Number.isSafeInteger(sample.triangleIndex));
        assert.ok(sample.triangleIndex >= 0);
        assert.ok(sample.triangleIndex * 3 + 2 < indices.length);
        assert.equal(sample.barycentric.length, 3);
        assert.ok(
          sample.barycentric.every((weight) => weight >= 0 && weight <= 1),
        );
        assert.ok(
          Math.abs(
            sample.barycentric.reduce((total, weight) => total + weight, 0) - 1,
          ) < 1e-6,
        );
        if (sampleIndex > 0) {
          assert.notDeepEqual(sample, path.samples[sampleIndex - 1]);
        }
      });
    }
    if (isBarycentricTrace) {
      const paths = Object.fromEntries(
        trace.paths.map((path) => [path.id, path]),
      );
      assert.equal(paths["left-brow-ridge"].emphasis, "secondary");
      assert.equal(paths["right-brow-ridge"].emphasis, "secondary");
      assert.equal(paths["left-cheekbone"].emphasis, "secondary");
      assert.equal(paths["right-cheekbone"].emphasis, "secondary");
      assert.equal(paths["left-temple-to-cheek"].emphasis, "secondary");
      assert.equal(paths["right-temple-to-cheek"].emphasis, "secondary");
      assert.equal(paths["philtrum-centerline"].emphasis, "secondary");
      assert.equal(paths["chin-centerline"].emphasis, "secondary");
      assert.deepEqual(
        paths["left-lower-eyelid"].samples[0],
        paths["left-upper-eyelid"].samples.at(-1),
      );
      assert.deepEqual(
        paths["left-lower-eyelid"].samples.at(-1),
        paths["left-upper-eyelid"].samples[0],
      );
      assert.deepEqual(
        paths["right-lower-eyelid"].samples[0],
        paths["right-upper-eyelid"].samples.at(-1),
      );
      assert.deepEqual(
        paths["right-lower-eyelid"].samples.at(-1),
        paths["right-upper-eyelid"].samples[0],
      );

      const eyeCapCenters = {
        left: 3930,
        right: 3929,
      };
      for (const side of ["left", "right"]) {
        for (const margin of ["upper", "lower"]) {
          const path = paths[`${side}-${margin}-eyelid`];
          path.samples.forEach((sample) => {
            const triangleOffset = sample.triangleIndex * 3;
            const triangleVertices = indices.slice(
              triangleOffset,
              triangleOffset + 3,
            );
            assert.ok(!triangleVertices.includes(eyeCapCenters[side]));
            const point = sample.barycentric.reduce(
              (resolved, weight, corner) =>
                resolved.map(
                  (value, axis) =>
                    value + weight * positions[triangleVertices[corner]][axis],
                ),
              [0, 0, 0],
            );
            assert.ok(point.every(Number.isFinite));
            const nearbyFrontDepth = Math.max(
              ...positions
                .filter(
                  (position) =>
                    Math.hypot(position[0] - point[0], position[1] - point[1]) <
                    0.008,
                )
                .map((position) => position[2]),
            );
            assert.ok(
              nearbyFrontDepth - point[2] < 0.025,
              `${path.id} recedes behind the visible eyelid surface`,
            );
          });
        }
      }
      for (const id of ["left-brow-ridge", "right-brow-ridge"]) {
        const path = paths[id];
        path.samples.forEach((sample) => {
          const triangleOffset = sample.triangleIndex * 3;
          const triangleVertices = indices.slice(
            triangleOffset,
            triangleOffset + 3,
          );
          const point = sample.barycentric.reduce(
            (resolved, weight, corner) =>
              resolved.map(
                (value, axis) =>
                  value + weight * positions[triangleVertices[corner]][axis],
              ),
            [0, 0, 0],
          );
          assert.ok(point.every(Number.isFinite));
          assert.ok(point[1] >= 0.45 && point[1] <= 0.57);
          const nearbyFrontDepth = Math.max(
            ...positions
              .filter(
                (position) =>
                  Math.hypot(position[0] - point[0], position[1] - point[1]) <
                  0.008,
              )
              .map((position) => position[2]),
          );
          assert.ok(
            nearbyFrontDepth - point[2] < 0.015,
            `${path.id} recedes behind the exterior brow surface`,
          );
        });
      }
      const reconstruct = (sample) => {
        const triangleOffset = sample.triangleIndex * 3;
        const triangleVertices = indices.slice(
          triangleOffset,
          triangleOffset + 3,
        );
        return sample.barycentric.reduce(
          (resolved, weight, corner) =>
            resolved.map(
              (value, axis) =>
                value + weight * positions[triangleVertices[corner]][axis],
            ),
          [0, 0, 0],
        );
      };
      for (const id of ["left-cheekbone", "right-cheekbone"]) {
        const path = paths[id];
        const points = path.samples.map(reconstruct);
        assert.ok(points.every((point) => point.every(Number.isFinite)));
        assert.ok(
          points.every((point) => point[1] >= 0.16 && point[1] <= 0.31),
        );
        const lateralTravel = Math.abs(points.at(-1)[0] - points[0][0]);
        const verticalTravel = Math.abs(points.at(-1)[1] - points[0][1]);
        assert.ok(lateralTravel > verticalTravel * 1.25);
        const expectedDirection = id.startsWith("left") ? -1 : 1;
        assert.equal(
          Math.sign(points.at(-1)[0] - points[0][0]),
          expectedDirection,
        );
        const turns = points.slice(1, -1).map((point, index) => {
          const previous = points[index];
          const next = points[index + 2];
          const incoming = point.map((value, axis) => value - previous[axis]);
          const outgoing = next.map((value, axis) => value - point[axis]);
          const cosine =
            incoming.reduce(
              (total, value, axis) => total + value * outgoing[axis],
              0,
            ) /
            (Math.hypot(...incoming) * Math.hypot(...outgoing));
          return Math.acos(Math.max(-1, Math.min(1, cosine)));
        });
        assert.ok(Math.max(...turns) < (25 * Math.PI) / 180);

        const otherPoints = trace.paths
          .filter((candidate) => candidate.id !== id)
          .flatMap((candidate) => candidate.samples.map(reconstruct));
        const minimumSeparation = Math.min(
          ...points.flatMap((point) =>
            otherPoints.map((other) =>
              Math.hypot(...point.map((value, axis) => value - other[axis])),
            ),
          ),
        );
        assert.ok(minimumSeparation > 0.05);
      }
      for (const id of ["left-temple-to-cheek", "right-temple-to-cheek"]) {
        const path = paths[id];
        const points = path.samples.map(reconstruct);
        assert.ok(points.every((point) => point.every(Number.isFinite)));
        assert.ok(
          points.every((point) => point[1] >= 0.27 && point[1] <= 0.46),
        );
        assert.ok(points.at(-1)[1] < points[0][1]);
        const lateralTravel = Math.abs(points.at(-1)[0] - points[0][0]);
        const verticalTravel = Math.abs(points.at(-1)[1] - points[0][1]);
        assert.ok(lateralTravel > verticalTravel * 0.45);
        const expectedDirection = id.startsWith("left") ? -1 : 1;
        assert.equal(
          Math.sign(points.at(-1)[0] - points[0][0]),
          expectedDirection,
        );
        const screenSpaceTurns = points.slice(1, -1).map((point, index) => {
          const previous = points[index];
          const next = points[index + 2];
          const incoming = point
            .slice(0, 2)
            .map((value, axis) => value - previous[axis]);
          const outgoing = next
            .slice(0, 2)
            .map((value, axis) => value - point[axis]);
          const cosine =
            incoming.reduce(
              (total, value, axis) => total + value * outgoing[axis],
              0,
            ) /
            (Math.hypot(...incoming) * Math.hypot(...outgoing));
          return Math.acos(Math.max(-1, Math.min(1, cosine)));
        });
        assert.ok(Math.max(...screenSpaceTurns) < (15 * Math.PI) / 180);

        const side = id.startsWith("left") ? "left" : "right";
        const neighboringPoints = [
          `${side}-brow-ridge`,
          `${side}-upper-eyelid`,
          `${side}-lower-eyelid`,
          `${side}-cheekbone`,
        ].flatMap((neighborId) => paths[neighborId].samples.map(reconstruct));
        const minimumNeighborSeparation = Math.min(
          ...points.flatMap((point) =>
            neighboringPoints.map((other) =>
              Math.hypot(...point.map((value, axis) => value - other[axis])),
            ),
          ),
        );
        assert.ok(minimumNeighborSeparation > 0.06);
      }
      for (const id of ["philtrum-centerline", "chin-centerline"]) {
        const path = paths[id];
        const points = path.samples.map(reconstruct);
        assert.ok(points.every((point) => point.every(Number.isFinite)));
        assert.ok(points.every((point) => Math.abs(point[0]) < 0.025));
        assert.ok(points.at(-1)[1] < points[0][1]);
        assert.ok(
          Math.abs(points.at(-1)[0] - points[0][0]) <
            Math.abs(points.at(-1)[1] - points[0][1]) * 0.05,
        );
      }

      const pathGap = (leftId, rightId) => {
        const left = paths[leftId].samples.map(reconstruct);
        const right = paths[rightId].samples.map(reconstruct);
        return Math.min(
          ...left.flatMap((point) =>
            right.map((other) =>
              Math.hypot(...point.map((value, axis) => value - other[axis])),
            ),
          ),
        );
      };
      assert.ok(pathGap("philtrum-centerline", "left-nose-wing") > 0.035);
      assert.ok(pathGap("philtrum-centerline", "right-nose-wing") > 0.035);
      assert.ok(pathGap("philtrum-centerline", "outer-lip") > 0.035);
      assert.ok(pathGap("chin-centerline", "outer-lip") > 0.05);
      assert.ok(pathGap("chin-centerline", "jaw") > 0.2);
    }
  }
});
