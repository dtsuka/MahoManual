import { getRequestListener } from "@hono/node-server";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { createApp } from "./app.js";

const DEV_PORT = Number(process.env.PORT ?? 5173);

async function main() {
  const apiApp = createApp();
  const apiListener = getRequestListener(apiApp.fetch);

  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { port: DEV_PORT + 1 } },
    appType: "spa",
  });

  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api")) {
      apiListener(req, res);
      return;
    }
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });

  server.listen(DEV_PORT, "127.0.0.1", () => {
    console.log(`Dev server listening on http://127.0.0.1:${DEV_PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
