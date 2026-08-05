import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");

const PACKAGE_BUILD_CONFIGS = {
  schema: {
    expectedName: "@synmere/schema",
    expectedFiles: [
      "index.js",
      "index.d.ts",
      "identity-release-manifest.schema.json",
    ],
    validate: async ({ packageRoot }) => {
      const [entry, declarations, releaseSchema] = await Promise.all([
        import(pathToFileURL(path.join(packageRoot, "index.js")).href),
        readFile(path.join(packageRoot, "index.d.ts"), "utf8"),
        readJson(path.join(packageRoot, "identity-release-manifest.schema.json")),
      ]);

      assert(
        entry.SYNMERE_SCHEMA_VERSION === "1.0.0",
        "Schema package must export SYNMERE_SCHEMA_VERSION 1.0.0.",
      );
      assert(
        entry.SYNMERE_STRUCTURE_PRESET?.BALANCED === "balanced" &&
          entry.SYNMERE_STRUCTURE_PRESET?.STRUCTURED === "structured" &&
          entry.SYNMERE_STRUCTURE_PRESET?.SOFT === "soft",
        "Schema package must export the canonical structure presets.",
      );
      assert(
        entry.FOUNDRY_ASSET_VARIANT_PRESENTATION_TYPE?.GLB === "glb" &&
          entry.FOUNDRY_ASSET_VARIANT_PRESENTATION_TYPE?.PARAMETER_PRESET ===
            "parameter-preset",
        "Schema package must export canonical asset variant presentation types.",
      );
      assert(
        declarations.includes("export type FaceShellParameters") &&
          declarations.includes("export type ReleasedAssetManifest") &&
          declarations.includes("export type FoundryAssetVariant") &&
          declarations.includes("export type FoundryAssetThumbnail"),
        "Schema package declarations must expose shell, release, variant, and thumbnail types.",
      );
      assert(
        releaseSchema.$schema &&
          releaseSchema.$id &&
          releaseSchema.type === "object",
        "Identity release JSON schema must be a parseable object schema.",
      );

      return {
        schemaVersion: entry.SYNMERE_SCHEMA_VERSION,
        jsonSchema: path.relative(
          PROJECT_ROOT,
          path.join(packageRoot, "identity-release-manifest.schema.json"),
        ),
      };
    },
  },
  three: {
    expectedName: "@synmere/three",
    expectedFiles: ["index.js", "index.d.ts"],
    validate: async ({ packageRoot }) => {
      const [entry, declarations] = await Promise.all([
        import(pathToFileURL(path.join(packageRoot, "index.js")).href),
        readFile(path.join(packageRoot, "index.d.ts"), "utf8"),
      ]);

      assert(
        typeof entry.validateReleasedAssetScene === "function",
        "Three package must export validateReleasedAssetScene.",
      );
      assert(
        declarations.includes("validateReleasedAssetScene"),
        "Three package declarations must expose validateReleasedAssetScene.",
      );

      const scene = {
        getObjectByName(name) {
          if (name !== "IdentityShell") {
            return undefined;
          }

          return {
            isMesh: true,
            material: { name: "IdentityCeramic" },
            morphTargetDictionary: {
              identity_face_wide: 0,
              presentation_structure_structured: 1,
              corrective_jaw_wide_chin_long: 2,
            },
          };
        },
      };
      const result = entry.validateReleasedAssetScene(scene, {
        meshName: "IdentityShell",
        materialSlots: ["IdentityCeramic"],
        identityMorphs: [{ positiveTarget: "identity_face_wide" }],
        presentationMorphs: [{ target: "presentation_structure_structured" }],
        expressionMorphs: [],
        correctiveMorphs: [{ target: "corrective_jaw_wide_chin_long" }],
      });

      assert(
        result.valid === true && result.errors.length === 0,
        "Three package validator must accept a complete released asset scene.",
      );

      return {
        adapter: "validateReleasedAssetScene",
      };
    },
  },
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const assertFileExists = async (filePath) => {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${path.relative(PROJECT_ROOT, filePath)} is missing.`);
  }
};

export const buildStaticPackage = async (packageName) => {
  const config = PACKAGE_BUILD_CONFIGS[packageName];

  if (!config) {
    throw new Error(
      `Unknown package "${packageName}". Expected one of: ${Object.keys(
        PACKAGE_BUILD_CONFIGS,
      ).join(", ")}.`,
    );
  }

  const packageRoot = path.join(PROJECT_ROOT, "packages", packageName);
  const packageManifest = await readJson(path.join(packageRoot, "package.json"));

  assert(
    packageManifest.name === config.expectedName,
    `${packageName} package name must be ${config.expectedName}.`,
  );
  assert(packageManifest.type === "module", `${packageName} must be ESM.`);
  assert(
    packageManifest.exports?.["."]?.import === "./index.js" &&
      packageManifest.exports?.["."]?.types === "./index.d.ts",
    `${packageName} package must expose import and type entries.`,
  );

  await Promise.all(
    config.expectedFiles.map(async (fileName) => {
      assert(
        packageManifest.files?.includes(fileName),
        `${packageName} package.json files must include ${fileName}.`,
      );
      await assertFileExists(path.join(packageRoot, fileName));
    }),
  );

  const details = await config.validate({ packageRoot, packageManifest });

  return {
    package: packageManifest.name,
    packageRoot: path.relative(PROJECT_ROOT, packageRoot),
    version: packageManifest.version,
    status: "built",
    ...details,
  };
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const packageName = process.argv[2];
  console.log(JSON.stringify(await buildStaticPackage(packageName), null, 2));
}
