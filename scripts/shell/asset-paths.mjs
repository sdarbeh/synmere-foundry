import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BLENDER_EXECUTABLE =
  [
    "/opt/homebrew/bin/blender",
    "/Applications/Blender.app/Contents/MacOS/Blender",
    "/usr/local/bin/blender",
  ].find((candidate) => existsSync(candidate)) ?? "blender";

export const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
export const SOURCE_BLEND_PATH = path.join(
  PROJECT_ROOT,
  "assets/source/identity-shell/identity-shell-v1.blend",
);
export const SOURCE_CONTRACT_PATH = path.join(
  PROJECT_ROOT,
  "assets/source/identity-shell/identity-shell-v1.contract.json",
);
export const RELEASE_MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  "manifests/identity-shell.current.json",
);
export const CURRENT_MODULE_MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  "manifests/identity-shell.module.json",
);
export const CANDIDATE_DIRECTORY = path.join(
  PROJECT_ROOT,
  "assets/candidates/current",
);
export const CANDIDATE_GLB_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.glb",
);
export const CANDIDATE_BLEND_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.blend",
);
export const CANDIDATE_MANIFEST_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.manifest.json",
);
export const CANDIDATE_MODULE_MANIFEST_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.module.json",
);
export const CANDIDATE_REVIEW_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.review.json",
);
export const CANDIDATE_VALIDATION_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.validation.json",
);
export const CANDIDATE_REVIEW_DIRECTORY = path.join(
  CANDIDATE_DIRECTORY,
  "review",
);
export const CANDIDATE_REVIEW_PORT =
  process.env.SYNMERE_FOUNDRY_REVIEW_PORT ?? "3102";
export const CANDIDATE_ASSET_PORT =
  process.env.SYNMERE_FOUNDRY_ASSET_PORT ?? "4100";
export const PRODUCTION_GLB_PATH = path.join(
  PROJECT_ROOT,
  "assets/releases/identity-shell/1.0.0/identity-shell.glb",
);
export const BLENDER_EXPORT_SCRIPT_PATH = path.join(
  SCRIPT_DIRECTORY,
  "export-candidate.py",
);
export const BLENDER_EXECUTABLE =
  process.env.SYNMERE_BLENDER_EXECUTABLE ?? DEFAULT_BLENDER_EXECUTABLE;

export const SHELL_ASSET_PIPELINE_VERSION = "1.0.0";
export const EXPECTED_MESH_NAME = "IdentityShell";
export const EXPECTED_MATERIAL_NAME = "IdentityCeramic";
export const MAXIMUM_MORPH_EDGE_STRAIN = 0.72;
export const MINIMUM_MORPH_EDGE_DELTA = 0.012;
export const MAXIMUM_MORPH_NORMAL_DELTA = 0.24;
