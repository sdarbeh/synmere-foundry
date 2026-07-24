import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BLENDER_EXECUTABLE,
  BLENDER_EXPORT_SCRIPT_PATH,
  CANDIDATE_BLEND_PATH,
  CANDIDATE_DIRECTORY,
  CANDIDATE_GLB_PATH,
  CANDIDATE_MANIFEST_PATH,
  EXPECTED_MESH_NAME,
  MAXIMUM_MORPH_EDGE_STRAIN,
  MAXIMUM_MORPH_NORMAL_DELTA,
  MINIMUM_MORPH_EDGE_DELTA,
  PRODUCTION_GLB_PATH,
  SHELL_ASSET_PIPELINE_VERSION,
  SOURCE_BLEND_PATH,
  SOURCE_CONTRACT_PATH,
} from "./asset-paths.mjs";
import {
  appendMorphNormals,
  computeMorphIntegrity,
  getGlbContract,
  getNodeExtras,
  readGlb,
  setNodeExtras,
  sha256File,
  writeGlb,
} from "./glb.mjs";

const runBlender = () => {
  const result = spawnSync(
    BLENDER_EXECUTABLE,
    [
      "--background",
      SOURCE_BLEND_PATH,
      "--python",
      BLENDER_EXPORT_SCRIPT_PATH,
      "--",
      CANDIDATE_GLB_PATH,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const processResult =
      result.signal === null
        ? `exit code ${result.status}`
        : `signal ${result.signal}`;
    const macOsMetalGuidance =
      process.platform === "darwin" && result.status === 139
        ? " Blender crashed during Metal startup. Run the review from a native macOS Terminal session, or allow Metal/GPU access for the current terminal."
        : "";
    const output = [result.stdout, result.stderr]
      .filter((value) => value?.trim())
      .join("\n")
      .trim()
      .slice(-4000);
    throw new Error(
      `Blender export failed with ${processResult}.${macOsMetalGuidance}${output ? `\n${output}` : ""}`,
    );
  }
};

const getBlenderVersion = () => {
  const result = spawnSync(BLENDER_EXECUTABLE, ["--version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("Unable to read the Blender version.");
  }
  return result.stdout.split(/\r?\n/u)[0].trim();
};

await readFile(SOURCE_BLEND_PATH);
await readFile(SOURCE_CONTRACT_PATH);
await mkdir(CANDIDATE_DIRECTORY, { recursive: true });
runBlender();
await copyFile(SOURCE_BLEND_PATH, CANDIDATE_BLEND_PATH);

const [candidate, production] = await Promise.all([
  readGlb(CANDIDATE_GLB_PATH),
  readGlb(PRODUCTION_GLB_PATH),
]);
const productionExtras = getNodeExtras(production, EXPECTED_MESH_NAME);
const sourceBlendSha256 = await sha256File(SOURCE_BLEND_PATH);
const blenderVersion = getBlenderVersion();
appendMorphNormals(candidate, EXPECTED_MESH_NAME, MAXIMUM_MORPH_NORMAL_DELTA);
const morphIntegrity = computeMorphIntegrity(
  candidate,
  EXPECTED_MESH_NAME,
  MINIMUM_MORPH_EDGE_DELTA,
  MAXIMUM_MORPH_EDGE_STRAIN,
);

// Exported candidates carry freshly computed integrity data and stable topology metadata.
setNodeExtras(candidate, EXPECTED_MESH_NAME, {
  ...productionExtras,
  source: "Canonical Blender source",
  sourceBlendSha256,
  blenderVersion,
  morphIntegrity,
});
await writeGlb(CANDIDATE_GLB_PATH, candidate);

const candidateContract = getGlbContract(
  await readGlb(CANDIDATE_GLB_PATH),
  EXPECTED_MESH_NAME,
);
const manifest = {
  schemaVersion: SHELL_ASSET_PIPELINE_VERSION,
  source: path.relative(process.cwd(), SOURCE_BLEND_PATH),
  candidate: path.relative(process.cwd(), CANDIDATE_GLB_PATH),
  blenderVersion,
  sourceBlendSha256,
  candidateSha256: await sha256File(CANDIDATE_GLB_PATH),
  exportedAt: new Date().toISOString(),
  exportSettings: {
    format: "GLB",
    selectionOnly: true,
    yUp: true,
    applyTransforms: false,
    materials: true,
    morphTargets: true,
    morphNormals: "recomputed-after-topology-safe-export",
    sharedAccessors: true,
    animations: false,
    skins: false,
    cameras: false,
    lights: false,
    extras: true,
  },
  contract: candidateContract,
};
await writeFile(
  CANDIDATE_MANIFEST_PATH,
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify(manifest, null, 2));
