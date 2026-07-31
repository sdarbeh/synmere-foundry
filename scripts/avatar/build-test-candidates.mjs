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
const THUMBNAIL_DIRECTORY = path.join(REVIEW_DIRECTORY, "thumbnails");
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

const TEST_AVATAR_ASSETS = [
  {
    id: "synmere.avatar.test-head",
    label: "Test Head",
    description:
      "Authored avatar head family for static rendering and adapter readiness checks.",
    stage: AVATAR_TEST_STAGE,
    source: {
      license: "unknown",
      source: "unknown",
      authorVendor: "unknown",
    },
    variants: [
      {
        id: "male",
        label: "Male",
        description:
          "Masculine authored headform used to inspect avatar rendering and adapter readiness.",
        sourceFileName: "test-head-male.fbx",
        glbFileName: "test-head-male.glb",
      },
      {
        id: "female",
        label: "Female",
        description:
          "Feminine authored headform used to inspect avatar rendering and adapter readiness.",
        sourceFileName: "test-head-female.fbx",
        glbFileName: "test-head-female.glb",
      },
    ],
  },
];

const sha256File = async (filePath) => {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));

  return hash.digest("hex");
};

const escapeXml = (value) => {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

const writePlaceholderThumbnail = async ({
  description,
  fileName,
  id,
  label,
  title,
}) => {
  const thumbnailPath = path.join(THUMBNAIL_DIRECTORY, fileName);
  const palette =
    id === "female"
      ? { background: "#f4f1ed", foreground: "#8b8eec" }
      : id === "male"
        ? { background: "#f0f1ef", foreground: "#6f72e8" }
        : { background: "#f3f2ef", foreground: "#4d4fa2" };

  await mkdir(path.dirname(thumbnailPath), { recursive: true });
  await writeFile(
    thumbnailPath,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapeXml(title)}">
  <rect width="512" height="512" rx="96" fill="${palette.background}"/>
  <circle cx="256" cy="214" r="112" fill="${palette.foreground}" opacity="0.16"/>
  <path d="M166 331c20-48 52-72 90-72s70 24 90 72" fill="none" stroke="${palette.foreground}" stroke-width="32" stroke-linecap="round"/>
  <path d="M182 206c18-60 55-92 110-92 44 0 80 19 108 56" fill="none" stroke="${palette.foreground}" stroke-width="26" stroke-linecap="round"/>
  <text x="256" y="414" text-anchor="middle" fill="#1b1d23" font-family="Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="32" font-weight="700">${escapeXml(label)}</text>
</svg>
`,
  );

  return {
    id: "preview-placeholder",
    label: "Preview placeholder",
    kind: "preview",
    source: "placeholder",
    path: path.relative(PROJECT_ROOT, thumbnailPath),
    publicPath: `/models/avatar/test/thumbnails/${fileName}`,
    width: 512,
    height: 512,
    sha256: await sha256File(thumbnailPath),
    isPlaceholder: true,
    description,
  };
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

const buildVariant = async ({ asset, variant }) => {
  const sourcePath = path.join(ORIGINAL_DIRECTORY, variant.sourceFileName);
  const glbPath = path.join(GLB_DIRECTORY, variant.glbFileName);
  const reportPath = path.join(
    REVIEW_DIRECTORY,
    variant.id,
    "conversion-report.json",
  );
  const variantReviewDirectory = path.dirname(reportPath);

  await mkdir(variantReviewDirectory, { recursive: true });

  const sourceStats = await stat(sourcePath);
  const sourceSha256 = await sha256File(sourcePath);
  const output = {
    id: variant.id,
    label: variant.label,
    description: variant.description,
    thumbnails: [
      await writePlaceholderThumbnail({
        description:
          "Generated placeholder thumbnail until avatar review renders are available.",
        fileName: `${asset.id.split(".").at(-1)}-${variant.id}-preview.svg`,
        id: variant.id,
        label: variant.label,
        title: `${asset.label} ${variant.label} preview placeholder`,
      }),
    ],
    source: {
      path: path.relative(PROJECT_ROOT, sourcePath),
      sha256: sourceSha256,
      sizeBytes: sourceStats.size,
      originalFormat: "FBX",
      license: asset.source.license,
      source: asset.source.source,
      authorVendor: asset.source.authorVendor,
    },
    glb: null,
    review: {
      path: path.relative(PROJECT_ROOT, variantReviewDirectory),
      renders: [],
      report: path.relative(PROJECT_ROOT, reportPath),
    },
    inspection: null,
    validation: {
      status: AVATAR_TEST_VALIDATION_STATUS,
      notes: [
        "Dev-stage avatar variant. Not promoted or release-ready.",
        "License/source metadata is unknown and must be resolved before product use.",
        "Adapter bindings remain provisional until morph or rig controls are verified.",
      ],
    },
  };
  assertKnownFoundryAssetMetadata({
    stage: asset.stage,
    label: `${asset.id}.${output.id}.source`,
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
      reviewDirectory: variantReviewDirectory,
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
      publicPath: `/models/avatar/test/${variant.glbFileName}`,
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

const getAssetValidationStatus = (variants) => {
  if (
    variants.some((variant) => variant.validation.status === "blocked")
  ) {
    return "blocked";
  }

  if (
    variants.some((variant) => variant.validation.status === "needs-review")
  ) {
    return "needs-review";
  }

  return "passed";
};

const buildAsset = async (asset) => {
  assertFoundryAssetStage(asset.stage);
  assertKnownFoundryAssetMetadata({
    stage: asset.stage,
    label: `${asset.id}.source`,
    metadata: asset.source,
  });

  const variants = [];

  for (const variant of asset.variants) {
    variants.push(await buildVariant({ asset, variant }));
  }

  return {
    id: asset.id,
    label: asset.label,
    description: asset.description,
    stage: asset.stage,
    thumbnails: [
      await writePlaceholderThumbnail({
        description:
          "Generated placeholder thumbnail for the avatar asset family until review renders are available.",
        fileName: `${asset.id.split(".").at(-1)}-preview.svg`,
        id: asset.id,
        label: asset.label,
        title: `${asset.label} asset preview placeholder`,
      }),
    ],
    source: asset.source,
    validation: {
      status: getAssetValidationStatus(variants),
      notes: [
        "Dev-stage avatar asset family. Not promoted or release-ready.",
        "Variant labels are generic authored options, not schema-level categories.",
        "License/source metadata is unknown and must be resolved before product use.",
        "Adapter bindings remain provisional until morph or rig controls are verified.",
      ],
    },
    variants,
  };
};

await mkdir(GLB_DIRECTORY, { recursive: true });
await mkdir(REVIEW_DIRECTORY, { recursive: true });

const assets = [];

for (const asset of TEST_AVATAR_ASSETS) {
  assets.push(await buildAsset(asset));
}

const manifest = {
  schemaVersion: "synmere.avatar.assets.v0",
  generatedAt: new Date().toISOString(),
  stage: AVATAR_TEST_STAGE,
  sourceOfTruth: "synmere-foundry/assets/candidates/avatar/test",
  assets,
};

await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      manifest: path.relative(PROJECT_ROOT, MANIFEST_PATH),
      assets: assets.map((asset) => ({
        id: asset.id,
        stage: asset.stage,
        validationStatus: asset.validation.status,
        variants: asset.variants.map((variant) => ({
          id: variant.id,
          glb: variant.glb?.path ?? null,
        })),
      })),
    },
    null,
    2,
  ),
);
