import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { pathToFileURL } from "node:url";

import {
  CANDIDATE_ASSET_PORT,
  CANDIDATE_GLB_PATH,
} from "../shell/asset-paths.mjs";

export const CANDIDATE_ASSET_ROUTE = "/identity-shell-v1.glb";

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
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? host}`,
    );
    if (requestUrl.pathname === "/health") {
      writeJson(response, 200, {
        ready: true,
        candidate: "identity-shell-v1.glb",
      });
      return;
    }
    if (
      requestUrl.pathname !== CANDIDATE_ASSET_ROUTE ||
      (request.method !== "GET" && request.method !== "HEAD")
    ) {
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
    url: `http://${host}:${address.port}${CANDIDATE_ASSET_ROUTE}`,
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
      "The GLB remains in assets/candidates/current; public/ is untouched.",
      "Press Ctrl+C to stop.",
    ].join("\n"),
  );
}
