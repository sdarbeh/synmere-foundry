import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import {
  assertFoundryAssetStage,
  assertFoundryAssetValidationStatus,
  assertKnownFoundryAssetMetadata,
} from "../release/asset-stage.mjs";

const PROJECT_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const CANDIDATE_ROOT = path.join(
  PROJECT_ROOT,
  "assets/candidates/avatar/test",
);
const ORIGINAL_DIRECTORY = path.join(CANDIDATE_ROOT, "original");
const GLB_DIRECTORY = path.join(CANDIDATE_ROOT, "glb");
const REVIEW_DIRECTORY = path.join(CANDIDATE_ROOT, "review");
const MANIFEST_PATH = path.join(CANDIDATE_ROOT, "avatar-candidates.manifest.json");
const BLENDER_SCRIPT_PATH = path.join(
  PROJECT_ROOT,
  "scripts/avatar/convert-test-candidate.py",
);
const APP_THREE_ROOT = path.resolve(PROJECT_ROOT, "../synmere/node_modules/three");

const BLENDER_BIN = process.env.BLENDER_BIN ?? "blender";
const AVATAR_TEST_STAGE = "dev";
const AVATAR_TEST_VALIDATION_STATUS = "needs-review";

assertFoundryAssetStage(AVATAR_TEST_STAGE);
assertFoundryAssetValidationStatus(AVATAR_TEST_VALIDATION_STATUS);

const TEST_CANDIDATES = [
  {
    id: "synmere.avatar.test-head-male",
    label: "Male",
    sourceFileName: "test-head-male.fbx",
    glbFileName: "test-head-male.glb",
  },
  {
    id: "synmere.avatar.test-head-female",
    label: "Female",
    sourceFileName: "test-head-female.fbx",
    glbFileName: "test-head-female.glb",
  },
];

const sha256File = async (filePath) => {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));

  return hash.digest("hex");
};

const installFileReaderPolyfill = () => {
  if (globalThis.FileReader) {
    return;
  }

  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (buffer) => {
          this.result = buffer;
          this.onloadend?.();
        },
        (error) => {
          this.error = error;
          this.onerror?.(error);
        },
      );
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        (buffer) => {
          this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
          this.onloadend?.();
        },
        (error) => {
          this.error = error;
          this.onerror?.(error);
        },
      );
    }
  };
};

const convertWithThreeFallback = async ({ sourcePath, glbPath, reportPath }) => {
  installFileReaderPolyfill();

  const [{ Box3, MeshStandardMaterial, Vector3 }, { FBXLoader }, { GLTFExporter }] =
    await Promise.all([
      import(path.join(APP_THREE_ROOT, "build/three.module.js")),
      import(path.join(APP_THREE_ROOT, "examples/jsm/loaders/FBXLoader.js")),
      import(path.join(APP_THREE_ROOT, "examples/jsm/exporters/GLTFExporter.js")),
    ]);
  const sourceBuffer = await readFile(sourcePath);
  const arrayBuffer = sourceBuffer.buffer.slice(
    sourceBuffer.byteOffset,
    sourceBuffer.byteOffset + sourceBuffer.byteLength,
  );
  const scene = new FBXLoader().parse(arrayBuffer, "");
  const objectNames = [];
  const meshNames = [];
  const materialNames = new Set();
  const shapeKeyObjectNames = [];
  const armatureNames = [];
  let meshCount = 0;
  let materialSlotCount = 0;

  scene.traverse((object) => {
    objectNames.push(object.name);

    if (object.isBone || object.type === "Bone") {
      armatureNames.push(object.name);
    }
    if (!object.isMesh) {
      return;
    }

    meshCount += 1;
    meshNames.push(object.name);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material].filter(Boolean);
    materialSlotCount += materials.length;
    materials.forEach((material) => {
      if (material?.name) {
        materialNames.add(material.name);
      }
    });

    if (object.morphTargetDictionary) {
      shapeKeyObjectNames.push(object.name);
    }

    // Normalize provisional test assets to a simple material so the GLB is
    // inspectable without depending on unresolved texture paths or licenses.
    object.material = new MeshStandardMaterial({
      color: 0x8a8a8a,
      metalness: 0,
      roughness: 0.58,
    });
  });

  const bounds = new Box3().setFromObject(scene);
  const boundsSize = bounds.getSize(new Vector3());
  const result = await new GLTFExporter().parseAsync(scene, { binary: true });
  await writeFile(glbPath, Buffer.from(result));
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        conversionTool: "three-fbx-loader-gltf-exporter",
        sourcePath,
        outputPath: glbPath,
        inspection: {
          armatureNames: [...new Set(armatureNames)].sort(),
          bounds: {
            maximum: bounds.max.toArray(),
            minimum: bounds.min.toArray(),
            size: boundsSize.toArray(),
          },
          materialNames: [...materialNames].sort(),
          materialSlotCount,
          meshCount,
          meshNames: meshNames.sort(),
          objectNames: [...new Set(objectNames)].sort(),
          shapeKeyObjectNames: shapeKeyObjectNames.sort(),
        },
        renderError:
          "Review renders require Blender; local Blender conversion/rendering is currently blocked.",
        renders: [],
      },
      null,
      2,
    )}\n`,
  );
};

const runBlenderConversion = async ({
  sourcePath,
  glbPath,
  reportPath,
  reviewDirectory,
}) => {
  await new Promise((resolve, reject) => {
    const process = spawn(
      BLENDER_BIN,
      [
        "--background",
        "--factory-startup",
        "--python",
        BLENDER_SCRIPT_PATH,
        "--",
        sourcePath,
        glbPath,
        reportPath,
        reviewDirectory,
      ],
      { stdio: "inherit" },
    );

    process.on("error", reject);
    process.on("exit", (code) => {
      if (code === 0) {
        resolve();

        return;
      }

      reject(new Error(`Blender exited with code ${code}.`));
    });
  });
};

const buildCandidate = async (candidate) => {
  const sourcePath = path.join(ORIGINAL_DIRECTORY, candidate.sourceFileName);
  const glbPath = path.join(GLB_DIRECTORY, candidate.glbFileName);
  const reportPath = path.join(
    REVIEW_DIRECTORY,
    candidate.label.toLowerCase(),
    "conversion-report.json",
  );
  const candidateReviewDirectory = path.dirname(reportPath);

  await mkdir(candidateReviewDirectory, { recursive: true });

  const sourceStats = await stat(sourcePath);
  const sourceSha256 = await sha256File(sourcePath);
  const output = {
    id: candidate.id,
    label: candidate.label,
    stage: AVATAR_TEST_STAGE,
    source: {
      path: path.relative(PROJECT_ROOT, sourcePath),
      sha256: sourceSha256,
      sizeBytes: sourceStats.size,
      originalFormat: "FBX",
      license: "unknown",
      source: "unknown",
      authorVendor: "unknown",
    },
    glb: null,
    review: {
      path: path.relative(PROJECT_ROOT, candidateReviewDirectory),
      renders: [],
      report: path.relative(PROJECT_ROOT, reportPath),
    },
    inspection: null,
    validation: {
      status: AVATAR_TEST_VALIDATION_STATUS,
      notes: [
        "Dev-stage avatar candidate. Not promoted or release-ready.",
        "License/source metadata is unknown and must be resolved before product use.",
        "Adapter bindings remain provisional until morph or rig controls are verified.",
      ],
    },
  };
  assertKnownFoundryAssetMetadata({
    stage: output.stage,
    label: `${output.id}.source`,
    metadata: {
      authorVendor: output.source.authorVendor,
      license: output.source.license,
      source: output.source.source,
    },
  });

  try {
    await runBlenderConversion({
      glbPath,
      reportPath,
      reviewDirectory: candidateReviewDirectory,
      sourcePath,
    });
  } catch (error) {
    output.validation.notes = [
      ...output.validation.notes,
      `Blender conversion failed: ${error instanceof Error ? error.message : "Unknown conversion error."}`,
      "Used Three.js FBXLoader/GLTFExporter fallback for dev-stage GLB visibility.",
    ];
    await convertWithThreeFallback({ glbPath, reportPath, sourcePath });
  }

  try {
    const [glbStats, glbSha256, conversionReport] = await Promise.all([
      stat(glbPath),
      sha256File(glbPath),
      readFile(reportPath, "utf8").then(JSON.parse),
    ]);

    output.glb = {
      path: path.relative(PROJECT_ROOT, glbPath),
      publicPath: `/models/avatar/test/${candidate.glbFileName}`,
      sha256: glbSha256,
      sizeBytes: glbStats.size,
    };
    output.review.renders = conversionReport.renders ?? [];
    output.inspection = conversionReport.inspection ?? null;
  } catch (error) {
    output.validation.status = "blocked";
    output.validation.notes = [
      ...output.validation.notes,
      error instanceof Error ? error.message : "Unknown conversion error.",
    ];
  }

  return output;
};

await mkdir(GLB_DIRECTORY, { recursive: true });
await mkdir(REVIEW_DIRECTORY, { recursive: true });

const candidates = [];

for (const candidate of TEST_CANDIDATES) {
  candidates.push(await buildCandidate(candidate));
}

const manifest = {
  schemaVersion: "synmere.avatar.test-candidates.v0",
  generatedAt: new Date().toISOString(),
  stage: AVATAR_TEST_STAGE,
  sourceOfTruth: "synmere-foundry/assets/candidates/avatar/test",
  candidates,
};

await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      manifest: path.relative(PROJECT_ROOT, MANIFEST_PATH),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        stage: candidate.stage,
        validationStatus: candidate.validation.status,
        glb: candidate.glb?.path ?? null,
      })),
    },
    null,
    2,
  ),
);
