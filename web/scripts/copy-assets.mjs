import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(srcDir, dstDir) {
  ensureDir(dstDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

const srcSprites = path.join(repoRoot, "ObeliskGemEV", "sprites");
const dstSprites = path.join(webRoot, "public", "sprites");
const srcArchSprites = path.join(srcSprites, "archaeology");
const dstArchSprites = path.join(dstSprites, "archaeology");

// Only what we currently need for the web UI modules.
copyDir(path.join(srcSprites, "event"), path.join(dstSprites, "event"));
copyDir(path.join(srcSprites, "common"), path.join(dstSprites, "common"));
copyDir(path.join(srcSprites, "stargazing"), path.join(dstSprites, "stargazing"));

// Block card sprites only (wiki fragments/skills come from download-arch-sprites.mjs).
ensureDir(dstArchSprites);
if (fs.existsSync(srcArchSprites)) {
  for (const entry of fs.readdirSync(srcArchSprites, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith("block_") || !entry.name.endsWith(".png")) continue;
    fs.copyFileSync(path.join(srcArchSprites, entry.name), path.join(dstArchSprites, entry.name));
  }
}

console.log("Copied sprites to web/public/sprites/");

