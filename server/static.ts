import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function resolveInside(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter((part) => part.length > 0);
  if (segments.some((part) => part === "." || part === ".." || part.startsWith("."))) return null;
  let rootReal: string;
  try {
    rootReal = realpathSync(root);
  } catch {
    return null;
  }
  const candidate = join(rootReal, ...segments);
  if (!existsSync(candidate)) return null;
  let fileReal: string;
  try {
    fileReal = realpathSync(candidate);
  } catch {
    return null;
  }
  if (fileReal !== rootReal && !fileReal.startsWith(rootReal + sep)) return null;
  try {
    if (!statSync(fileReal).isFile()) return null;
  } catch {
    return null;
  }
  return fileReal;
}

export function serveStatic(root: string, pathname: string, request: IncomingMessage, response: ServerResponse, method: string): boolean {
  const file = resolveInside(root, pathname) ?? fallbackIndex(root, pathname, request);
  if (!file) return false;
  const stat = statSync(file);
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  response.writeHead(200, {
    "content-type": type,
    "content-length": stat.size,
    "cache-control": cacheControl(file),
    "x-content-type-options": "nosniff",
  });
  if (method === "HEAD") {
    response.end();
    return true;
  }
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!response.headersSent) response.writeHead(500);
    response.destroy();
  });
  stream.pipe(response);
  return true;
}

function fallbackIndex(root: string, pathname: string, request: IncomingMessage): string | null {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const acceptsHtml = headerList(request.headers.accept).includes("text/html");
  if (pathname !== "/" && pathname !== "" && (extname(decoded) !== "" || !acceptsHtml)) return null;
  return resolveInside(root, "/index.html");
}

function headerList(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(",");
  return value ?? "";
}

function cacheControl(file: string): string {
  if (file.endsWith(`${sep}index.html`)) return "no-cache";
  if (file.includes(`${sep}assets${sep}`)) return "public, max-age=31536000, immutable";
  return "public, max-age=3600";
}
