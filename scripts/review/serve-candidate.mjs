import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { pathToFileURL } from "node:url";

import {
  CANDIDATE_ASSET_PORT,
  CANDIDATE_GLB_PATH,
  CANDIDATE_MANIFEST_PATH,
  CANDIDATE_MODULE_MANIFEST_PATH,
} from "../shell/asset-paths.mjs";

export const CANDIDATE_ASSET_ROUTE = "/identity-shell-v1.glb";
export const CANDIDATE_MANIFEST_ROUTE =
  "/identity-shell-v1.candidate-manifest.json";
export const CANDIDATE_MODULE_ROUTE = "/identity-shell-v1.module.json";

const writeJson = (response, statusCode, value) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(value)}\n`);
};

export const startCandidateServer = async ({
  host = "127.0.0.1",
  port = Number(CANDIDATE_ASSET_PORT),
} = {}) => {
  const candidate = await stat(CANDIDATE_GLB_PATH);
  const candidateManifest = await stat(CANDIDATE_MANIFEST_PATH);
  const candidateModule = await stat(CANDIDATE_MODULE_MANIFEST_PATH).catch(
    () => null,
  );
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? host}`,
    );
    if (requestUrl.pathname === "/health") {
      writeJson(response, 200, {
        ready: true,
        candidate: "identity-shell-v1.glb",
        manifest: "identity-shell-v1.candidate-manifest.json",
        module: candidateModule ? "identity-shell-v1.module.json" : null,
      });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      writeJson(response, 404, { error: "Candidate asset not found." });
      return;
    }
    if (requestUrl.pathname === CANDIDATE_MANIFEST_ROUTE) {
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": candidateManifest.size,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      const stream = createReadStream(CANDIDATE_MANIFEST_PATH);
      stream.on("error", () => {
        response.destroy();
      });
      stream.pipe(response);
      return;
    }
    if (requestUrl.pathname === CANDIDATE_MODULE_ROUTE) {
      if (!candidateModule) {
        writeJson(response, 404, {
          error: "Candidate asset module not found.",
        });
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": candidateModule.size,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      const stream = createReadStream(CANDIDATE_MODULE_MANIFEST_PATH);
      stream.on("error", () => {
        response.destroy();
      });
      stream.pipe(response);
      return;
    }
    if (requestUrl.pathname !== CANDIDATE_ASSET_ROUTE) {
      writeJson(response, 404, { error: "Candidate asset not found." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": "model/gltf-binary",
      "Content-Length": candidate.size,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(CANDIDATE_GLB_PATH);
    stream.on("error", () => {
      response.destroy();
    });
    stream.pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to resolve the candidate server address.");
  }
  return {
    server,
    manifestUrl: `http://${host}:${address.port}${CANDIDATE_MANIFEST_ROUTE}`,
    url: `http://${host}:${address.port}${CANDIDATE_ASSET_ROUTE}`,
    moduleUrl: `http://${host}:${address.port}${CANDIDATE_MODULE_ROUTE}`,
    close: () => {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const candidateServer = await startCandidateServer();
  console.log(
    [
      "Synmere candidate asset is ready.",
      `URL: ${candidateServer.url}`,
      `Manifest: ${candidateServer.manifestUrl}`,
      `Module: ${candidateServer.moduleUrl}`,
      "The GLB remains in assets/candidates/current; public/ is untouched.",
      "Press Ctrl+C to stop.",
    ].join("\n"),
  );
}
