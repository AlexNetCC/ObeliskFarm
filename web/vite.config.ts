import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// GitHub Pages serves project sites under "/<repo>/".
// We keep dev experience simple ("/") and let CI set BASE_PATH.
const base = process.env.BASE_PATH ?? "/";

/** Dev-only: POST /api/backup writes localStorage snapshot to web/backups/ */
function backupPlugin() {
  return {
    name: "obelisk-backup",
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req: any, res: any, next: () => void) => {
        if (req.url !== "/api/backup" || req.method !== "POST") {
          next();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const dir = path.join(process.cwd(), "backups");
            fs.mkdirSync(dir, { recursive: true });
            const name = `obelisk-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
            const filePath = path.join(dir, name);
            fs.writeFileSync(filePath, body, "utf8");
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, file: name }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), backupPlugin()],
  base,
});

