import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EXPECTED_MESH_NAME,
  MAXIMUM_MORPH_EDGE_STRAIN,
  MAXIMUM_MORPH_NORMAL_DELTA,
  MINIMUM_MORPH_EDGE_DELTA,
  PRODUCTION_GLB_PATH,
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

const [candidateArgument, sourceArgument, manifestArgument] =
  process.argv.slice(2);

if (!candidateArgument || !sourceArgument || !manifestArgument) {
  throw new Error(
    "Expected candidate GLB, candidate Blender source, and manifest paths.",
  );
}

const candidatePath = path.resolve(candidateArgument);
const sourcePath = path.resolve(sourceArgument);
const manifestPath = path.resolve(manifestArgument);

await Promise.all([
  readFile(candidatePath),
  readFile(sourcePath),
  readFile(PRODUCTION_GLB_PATH),
]);

const [candidate, production] = await Promise.all([
  readGlb(candidatePath),
  readGlb(PRODUCTION_GLB_PATH),
]);

appendMorphNormals(candidate, EXPECTED_MESH_NAME, MAXIMUM_MORPH_NORMAL_DELTA);
const morphIntegrity = computeMorphIntegrity(
  candidate,
  EXPECTED_MESH_NAME,
  MINIMUM_MORPH_EDGE_DELTA,
  MAXIMUM_MORPH_EDGE_STRAIN,
);
setNodeExtras(candidate, EXPECTED_MESH_NAME, {
  ...getNodeExtras(production, EXPECTED_MESH_NAME),
  source: "Isolated validated morph-safety candidate",
  sourceBlendSha256: await sha256File(sourcePath),
  morphIntegrity,
});
await writeGlb(candidatePath, candidate);

const manifest = {
  schemaVersion: "v1",
  source: path.relative(process.cwd(), sourcePath),
  candidate: path.relative(process.cwd(), candidatePath),
  sourceBlendSha256: await sha256File(sourcePath),
  candidateSha256: await sha256File(candidatePath),
  contract: getGlbContract(await readGlb(candidatePath), EXPECTED_MESH_NAME),
  morphIntegrity,
  promotionApproved: false,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
