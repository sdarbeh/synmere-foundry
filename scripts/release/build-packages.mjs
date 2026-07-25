import { pathToFileURL } from "node:url";

import { writeManifestPackage } from "./build-manifest-package.mjs";
import { buildStaticPackage } from "./build-static-package.mjs";

export const buildPackages = async () => {
  const [schema, three, manifest] = await Promise.all([
    buildStaticPackage("schema"),
    buildStaticPackage("three"),
    writeManifestPackage(),
  ]);

  return {
    packages: [schema, three, { package: "@synmere/manifest", ...manifest }],
  };
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await buildPackages(), null, 2));
}
