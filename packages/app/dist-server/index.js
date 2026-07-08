import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = createApp();
app.use("/*", serveStatic({ root: join(packageRoot, "dist") }));
app.get("*", serveStatic({ path: join(packageRoot, "dist/index.html") }));
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server listening on http://127.0.0.1:${info.port}`);
});
