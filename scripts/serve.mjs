import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "site");
const PORT = Number.parseInt(process.env.PORT ?? "4173", 10);
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (pathname === "/drama-ready") {
    response.writeHead(302, { Location: "/drama-ready/" }).end();
    return;
  } else if (pathname === "/drama-ready/") {
    pathname = "/index.html";
  } else if (pathname.startsWith("/drama-ready/")) {
    pathname = pathname.slice("/drama-ready".length);
  }

  const requested = path.resolve(ROOT, `.${pathname}`);
  if (requested !== ROOT && !requested.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(requested);
    const file = stat.isDirectory() ? path.join(requested, "index.html") : requested;
    const body = await fs.readFile(file);
    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Drama Ready is running at http://localhost:${PORT}/drama-ready/`);
});
