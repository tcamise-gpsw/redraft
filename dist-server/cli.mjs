// server/cli.ts
import { exec } from "node:child_process";
import { stat as stat4 } from "node:fs/promises";
import { resolve as resolve5 } from "node:path";
import { Command } from "commander";

// server/fs/watcher.ts
import chokidar from "chokidar";
import { relative as relative2, resolve as resolve2 } from "node:path";

// server/fs/operations.ts
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile as readFileFromDisk,
  readdir,
  stat,
  unlink,
  writeFile as writeFileToDisk
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

// server/types.ts
var FileOperationError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.name = "FileOperationError";
    this.status = status;
  }
};

// server/fs/operations.ts
function resolvePath(basePath, relativePath) {
  const resolvedBase = resolve(basePath);
  const resolvedPath = resolve(resolvedBase, relativePath);
  const relativePathToBase = relative(resolvedBase, resolvedPath);
  if (relativePathToBase.startsWith("..")) {
    throw new FileOperationError(400, "Path escapes the proposals root.");
  }
  return resolvedPath;
}
function isTrackedProposalFile(path) {
  return path.endsWith(".md") || path.endsWith(".comments.json");
}
async function walkFiles(basePath, currentPath = "") {
  const directoryPath = resolvePath(basePath, currentPath || ".");
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextRelativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await walkFiles(basePath, nextRelativePath));
      continue;
    }
    if (!entry.isFile() || !isTrackedProposalFile(nextRelativePath)) {
      continue;
    }
    files.push({ path: nextRelativePath, type: "blob" });
  }
  return files;
}
function computeBlobSha(content) {
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}
async function readFile(basePath, relativePath) {
  const filePath = resolvePath(basePath, relativePath);
  let content;
  try {
    content = await readFileFromDisk(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new FileOperationError(404, `File not found: ${relativePath}`);
    }
    throw error;
  }
  return { content, sha: computeBlobSha(content) };
}
async function writeFile(basePath, relativePath, content, expectedSha) {
  const filePath = resolvePath(basePath, relativePath);
  const current = await readFile(basePath, relativePath);
  if (expectedSha && expectedSha !== current.sha) {
    throw new FileOperationError(409, "File SHA conflict.");
  }
  await writeFileToDisk(filePath, content);
  return { sha: computeBlobSha(content) };
}
async function createFile(basePath, relativePath, content) {
  const filePath = resolvePath(basePath, relativePath);
  try {
    await stat(filePath);
    throw new FileOperationError(422, `File already exists: ${relativePath}`);
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFileToDisk(filePath, content);
  return { sha: computeBlobSha(content) };
}
async function deleteFile(basePath, relativePath, expectedSha) {
  const current = await readFile(basePath, relativePath);
  if (expectedSha !== current.sha) {
    throw new FileOperationError(409, "File SHA conflict.");
  }
  const filePath = resolvePath(basePath, relativePath);
  await unlink(filePath);
}
async function listFiles(basePath) {
  const files = await walkFiles(basePath);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

// server/fs/watcher.ts
function isTrackedProposalFile2(path) {
  return path.endsWith(".md") || path.endsWith(".comments.json");
}
function toRelativePath(basePath, filePath) {
  const resolvedBase = resolve2(basePath);
  const resolvedFile = resolve2(filePath);
  const relativePath = relative2(resolvedBase, resolvedFile);
  if (relativePath === "" || relativePath.startsWith("..")) {
    return null;
  }
  return relativePath;
}
function startWatcher(basePath, onEvent) {
  const watcher = chokidar.watch(basePath, {
    ignoreInitial: true,
    persistent: true
  });
  const pendingEvents = /* @__PURE__ */ new Map();
  let flushTimer;
  const queueEvent = (type, filePath) => {
    const relativePath = toRelativePath(basePath, filePath);
    if (!relativePath || !isTrackedProposalFile2(relativePath)) {
      return;
    }
    const previousType = pendingEvents.get(relativePath);
    if (previousType === "file:created" && type === "file:changed") {
      pendingEvents.set(relativePath, previousType);
    } else {
      pendingEvents.set(relativePath, type);
    }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      flushTimer = void 0;
      const currentBatch = Array.from(pendingEvents.entries());
      pendingEvents.clear();
      for (const [path, eventType] of currentBatch) {
        if (eventType === "file:deleted") {
          onEvent({ type: eventType, path });
          continue;
        }
        try {
          const file = await readFile(basePath, path);
          onEvent({ type: eventType, path, sha: file.sha });
        } catch {
        }
      }
    }, 100);
  };
  watcher.on("add", (filePath) => queueEvent("file:created", filePath));
  watcher.on("change", (filePath) => queueEvent("file:changed", filePath));
  watcher.on("unlink", (filePath) => queueEvent("file:deleted", filePath));
  return () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = void 0;
    }
    void watcher.close();
  };
}

// server/app.ts
import {
  createServer
} from "node:http";
import { access, readFile as readFile2, stat as stat3 } from "node:fs/promises";
import { extname, resolve as resolve4 } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

// server/routes/index.ts
import { Hono } from "hono";

// server/routes/commits.ts
import { stat as stat2 } from "node:fs/promises";
import { resolve as resolve3 } from "node:path";
function registerCommitsRoute(app, helpers) {
  app.get("/api/github/repos/:owner/:repo/commits", async (c) => {
    const apiPath = c.req.query("path");
    if (!apiPath) {
      return helpers.json([]);
    }
    const localPath = helpers.toLocalPath(apiPath);
    const fileStats = await stat2(resolve3(helpers.basePath, localPath));
    return helpers.json([
      {
        commit: {
          message: "Local file update",
          author: { date: fileStats.mtime.toISOString() }
        },
        author: {
          login: "local-user",
          avatar_url: ""
        }
      }
    ]);
  });
}

// server/routes/contents.ts
function decodeContent(body) {
  if (!body.content) {
    throw new FileOperationError(
      400,
      "Request body must include base64 content."
    );
  }
  return Buffer.from(body.content, "base64");
}
function requireApiPath(path) {
  if (!path) {
    throw new FileOperationError(400, "Request path is required.");
  }
  return path;
}
function registerContentsRoute(app, helpers) {
  app.get("/api/github/repos/:owner/:repo/contents/:path{.+}", async (c) => {
    const localPath = helpers.toLocalPath(requireApiPath(c.req.param("path")));
    const file = await readFile(helpers.basePath, localPath);
    return helpers.json({
      type: "file",
      sha: file.sha,
      content: file.content.toString("base64")
    });
  });
  app.put("/api/github/repos/:owner/:repo/contents/:path{.+}", async (c) => {
    const localPath = helpers.toLocalPath(requireApiPath(c.req.param("path")));
    const body = await c.req.json();
    let result;
    try {
      result = await writeFile(
        helpers.basePath,
        localPath,
        decodeContent(body),
        body.sha ?? null
      );
    } catch (error) {
      if (error instanceof FileOperationError && error.status === 404 && !body.sha) {
        result = await createFile(
          helpers.basePath,
          localPath,
          decodeContent(body)
        );
      } else {
        throw error;
      }
    }
    return helpers.json({ content: { sha: result.sha } });
  });
  app.post("/api/github/repos/:owner/:repo/contents/:path{.+}", async (c) => {
    const localPath = helpers.toLocalPath(requireApiPath(c.req.param("path")));
    const body = await c.req.json();
    const result = await createFile(
      helpers.basePath,
      localPath,
      decodeContent(body)
    );
    return helpers.json({ content: { sha: result.sha } }, 201);
  });
  app.delete("/api/github/repos/:owner/:repo/contents/:path{.+}", async (c) => {
    const localPath = helpers.toLocalPath(requireApiPath(c.req.param("path")));
    const body = await c.req.json();
    if (!body.sha) {
      throw new FileOperationError(400, "Request body must include a sha.");
    }
    await deleteFile(helpers.basePath, localPath, body.sha);
    return helpers.json({ content: null });
  });
}

// server/routes/git.ts
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { relative as relative3 } from "node:path";
import { promisify } from "node:util";
var execGit = promisify(execFile);
async function getRepoContext(basePath) {
  try {
    const { stdout } = await execGit("git", ["rev-parse", "--show-toplevel"], {
      cwd: basePath
    });
    const repoRoot = await realpath(stdout.trim());
    const resolvedBasePath = await realpath(basePath);
    return {
      repoRoot,
      relativeScope: relative3(repoRoot, resolvedBasePath) || "."
    };
  } catch {
    throw new FileOperationError(404, "Not a git repository.");
  }
}
function mapStatus(code) {
  if (code === "??") {
    return "untracked";
  }
  if (code.includes("D")) {
    return "deleted";
  }
  return "modified";
}
function defaultCommitMessage() {
  return `Update proposals via ReDraft (${(/* @__PURE__ */ new Date()).toISOString()})`;
}
function registerGitRoute(app, helpers) {
  app.get("/api/git/status", async () => {
    const { repoRoot, relativeScope } = await getRepoContext(helpers.basePath);
    const { stdout } = await execGit(
      "git",
      ["status", "--porcelain", "--", relativeScope],
      {
        cwd: repoRoot
      }
    );
    const files = stdout.split("\n").map((line) => line.trimEnd()).filter(Boolean).map((line) => ({
      path: line.slice(3).trim(),
      status: mapStatus(line.slice(0, 2))
    }));
    return helpers.json({ dirty: files.length > 0, files });
  });
  app.post("/api/git/commit", async (c) => {
    const body = await c.req.json();
    const message = body.message?.trim() || defaultCommitMessage();
    const { repoRoot, relativeScope } = await getRepoContext(helpers.basePath);
    await execGit("git", ["add", "--", relativeScope], { cwd: repoRoot });
    await execGit(
      "git",
      [
        "-c",
        "user.name=ReDraft",
        "-c",
        "user.email=redraft@local",
        "commit",
        "-m",
        message
      ],
      { cwd: repoRoot }
    );
    const { stdout } = await execGit("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot
    });
    return helpers.json({ sha: stdout.trim(), message });
  });
}

// server/routes/tree.ts
function registerTreeRoute(app, helpers) {
  app.get("/api/github/repos/:owner/:repo/git/trees/:ref", async () => {
    const tree = await listFiles(helpers.basePath);
    return helpers.json({
      tree: tree.map((entry) => ({
        path: helpers.toApiPath(entry.path),
        type: entry.type
      }))
    });
  });
}

// server/routes/user.ts
function registerUserRoute(app, helpers) {
  app.get("/api/github/user", () => {
    return helpers.json({ login: "local-user", avatar_url: "" });
  });
}

// server/routes/index.ts
var RATE_LIMIT_HEADERS = {
  "x-ratelimit-limit": "1000000",
  "x-ratelimit-remaining": "999999",
  "x-ratelimit-reset": "4102444800"
};
function toLocalPath(apiPath) {
  if (!apiPath.startsWith("proposals/")) {
    throw new FileOperationError(404, `Unsupported path: ${apiPath}`);
  }
  return apiPath.slice("proposals/".length);
}
function toApiPath(localPath) {
  return `proposals/${localPath}`;
}
function buildGitHubApiRouter(basePath) {
  const app = new Hono();
  const json = (body, status = 200) => {
    const response = Response.json(body, { status });
    for (const [header, value] of Object.entries(RATE_LIMIT_HEADERS)) {
      response.headers.set(header, value);
    }
    return response;
  };
  app.onError((error) => {
    if (error instanceof FileOperationError) {
      return json({ message: error.message }, error.status);
    }
    return json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  });
  const helpers = { basePath, json, toApiPath, toLocalPath };
  registerUserRoute(app, helpers);
  registerTreeRoute(app, helpers);
  registerContentsRoute(app, helpers);
  registerCommitsRoute(app, helpers);
  registerGitRoute(app, helpers);
  return app;
}

// server/ws/hub.ts
import { EventEmitter } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
var WebSocketHub = class extends EventEmitter {
  server = new WebSocketServer({ noServer: true });
  clients = /* @__PURE__ */ new Set();
  constructor() {
    super();
    this.server.on("connection", (client) => {
      this.clients.add(client);
      this.emit("connection-count", this.connectionCount);
      const removeClient = () => {
        this.clients.delete(client);
        this.emit("connection-count", this.connectionCount);
      };
      client.on("close", removeClient);
      client.on("error", removeClient);
    });
  }
  get connectionCount() {
    return this.clients.size;
  }
  handleUpgrade(request, socket, head) {
    this.server.handleUpgrade(request, socket, head, (client) => {
      this.server.emit("connection", client, request);
    });
  }
  broadcast(event) {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        this.clients.delete(client);
        continue;
      }
      client.send(message);
    }
  }
  async close() {
    const { promise, resolve: resolve6, reject } = Promise.withResolvers();
    this.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve6();
    });
    await promise;
  }
};

// server/app.ts
var CONTENT_TYPE_BY_EXTENSION = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
function injectLocalModeMeta(html) {
  const metaTag = '<meta name="redraft-mode" content="local">';
  if (html.includes(metaTag)) {
    return html;
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `  ${metaTag}</head>`);
  }
  return `${metaTag}${html}`;
}
function contentTypeFor(path) {
  return CONTENT_TYPE_BY_EXTENSION[extname(path)] ?? "application/octet-stream";
}
async function loadStaticResponse(uiRoot, requestPath) {
  const resolvedUiRoot = resolve4(uiRoot);
  const normalizedPath = requestPath === "/" ? "index.html" : requestPath.replace(/^\//, "");
  const staticPath = resolve4(resolvedUiRoot, normalizedPath);
  if (!staticPath.startsWith(resolvedUiRoot)) {
    return null;
  }
  try {
    const fileStats = await stat3(staticPath);
    if (!fileStats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  const file = await readFile2(staticPath);
  const body = normalizedPath === "index.html" ? injectLocalModeMeta(file.toString("utf8")) : file;
  return new Response(body, {
    headers: { "content-type": contentTypeFor(normalizedPath) }
  });
}
function buildReDraftApp(options) {
  const app = buildGitHubApiRouter(options.basePath);
  app.get("*", async (c) => {
    if (options.noUi) {
      return c.notFound();
    }
    const { pathname } = new URL(c.req.url);
    const directFile = await loadStaticResponse(options.uiRoot, pathname);
    if (directFile) {
      return directFile;
    }
    if (extname(pathname) !== "") {
      return c.notFound();
    }
    const indexFile = await loadStaticResponse(options.uiRoot, "/");
    return indexFile ?? c.notFound();
  });
  return app;
}
function toRequest(request, fallbackOrigin) {
  const url = new URL(request.url ?? "/", fallbackOrigin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
      continue;
    }
    if (value !== void 0) {
      headers.set(key, value);
    }
  }
  const init = {
    method: request.method,
    headers
  };
  if (request.method && !["GET", "HEAD"].includes(request.method)) {
    init.body = Readable.toWeb(request);
    init.duplex = "half";
  }
  return new Request(url, init);
}
async function sendResponse(response, nodeResponse) {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });
  if (!response.body) {
    nodeResponse.end();
    return;
  }
  const { promise, resolve: resolve6, reject } = Promise.withResolvers();
  Readable.fromWeb(response.body).pipe(nodeResponse);
  nodeResponse.once("finish", resolve6);
  nodeResponse.once("error", reject);
  await promise;
}
async function startReDraftServer(options) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4200;
  const app = buildReDraftApp(options);
  const hub = new WebSocketHub();
  const server = createServer(async (request, response) => {
    const honoResponse = await app.fetch(
      toRequest(request, `http://${request.headers.host ?? `${host}:${port}`}`)
    );
    await sendResponse(honoResponse, response);
  });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${host}:${port}`}`
    );
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    hub.handleUpgrade(request, socket, head);
  });
  const {
    promise,
    resolve: resolveListen,
    reject: rejectListen
  } = Promise.withResolvers();
  server.listen(port, host, () => resolveListen());
  server.once("error", rejectListen);
  await promise;
  return {
    app,
    hub,
    server,
    url: `http://${host}:${port}`,
    close: async () => {
      await hub.close();
      const {
        promise: closePromise,
        resolve: resolveClose,
        reject: rejectClose
      } = Promise.withResolvers();
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }
        resolveClose();
      });
      await closePromise;
    }
  };
}
function resolveUiRoot() {
  return fileURLToPath(new URL("../dist", import.meta.url));
}
async function verifyUiBuild(uiRoot) {
  await access(resolve4(uiRoot, "index.html"));
}

// server/cli.ts
async function ensureDirectoryExists(path) {
  const fileStats = await stat4(path);
  if (!fileStats.isDirectory()) {
    throw new Error(`Not a directory: ${path}`);
  }
}
function browserOpenCommand(url) {
  if (process.platform === "darwin") {
    return `open ${JSON.stringify(url)}`;
  }
  if (process.platform === "win32") {
    return `start "" ${JSON.stringify(url)}`;
  }
  return `xdg-open ${JSON.stringify(url)}`;
}
function triggerBrowserOpen(url) {
  exec(browserOpenCommand(url));
}
async function runServe(directory = "./proposals", options = {}) {
  const basePath = resolve5(directory);
  await ensureDirectoryExists(basePath);
  const uiRoot = resolveUiRoot();
  if (!options.noUi) {
    await verifyUiBuild(uiRoot);
  }
  const runningServer = await startReDraftServer({
    basePath,
    uiRoot,
    noUi: options.noUi,
    host: options.host,
    port: options.port
  });
  const stopWatcher = startWatcher(basePath, (event) => {
    runningServer.hub.broadcast(event);
  });
  console.log(`ReDraft local server listening at ${runningServer.url}`);
  if (options.open) {
    triggerBrowserOpen(runningServer.url);
  }
  const shutdown = async (exitCode = 0) => {
    stopWatcher();
    await runningServer.close();
    process.exit(exitCode);
  };
  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}
function registerServeOptions(command) {
  return command.option(
    "--port <number>",
    "Port to listen on (default: 4200)",
    (value) => Number(value)
  ).option("--open", "Open the ReDraft UI in the default browser", false).option("--no-ui", "Skip serving the static frontend", false).option(
    "--host <string>",
    "Bind address (default: 127.0.0.1)",
    "127.0.0.1"
  );
}
var program = registerServeOptions(
  new Command().name("redraft").description("ReDraft local tooling").argument("[directory]", "proposal directory for the default serve command").action(async function(directory) {
    if (!directory) {
      program.help();
      return;
    }
    try {
      await runServe(directory, this.optsWithGlobals());
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })
);
registerServeOptions(
  program.command("serve").argument("[directory]", "proposal directory").action(async function(directory) {
    try {
      await runServe(
        directory ?? "./proposals",
        this.optsWithGlobals()
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })
);
program.parse(process.argv);
