import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EXPECTED_MESH_NAME,
  PRODUCTION_GLB_PATH,
  SHELL_ASSET_PIPELINE_VERSION,
  SOURCE_CONTRACT_PATH,
} from "../shell/asset-paths.mjs";
import {
  getGlbContract,
  getNodeExtras,
  readGlb,
  sha256File,
} from "../shell/glb.mjs";

const production = await readGlb(PRODUCTION_GLB_PATH);
const contract = getGlbContract(production, EXPECTED_MESH_NAME);
const extras = getNodeExtras(production, EXPECTED_MESH_NAME);
const snapshot = {
  schemaVersion: SHELL_ASSET_PIPELINE_VERSION,
  capturedFrom: "assets/releases/identity-shell/1.1.1/identity-shell.glb",
  productionSha256: await sha256File(PRODUCTION_GLB_PATH),
  contract,
  preservedMetadata: {
    assetId: extras.assetId,
    topologyVersion: extras.topologyVersion,
    presentationTopology: extras.presentationTopology,
  },
};

await mkdir(path.dirname(SOURCE_CONTRACT_PATH), { recursive: true });
await writeFile(SOURCE_CONTRACT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(JSON.stringify(snapshot, null, 2));
