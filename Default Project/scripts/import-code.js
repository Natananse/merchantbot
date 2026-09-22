// Reconstructs the full project from docs/FULL_CODE.md (created by
// export-code.js) into a fresh, runnable folder.
//
// The rebuilt folder contains every source file plus a ready `.env` copied
// from `.env.example` — the only edits needed to run it are BOT_TOKEN and
// ADMIN_TELEGRAM_ID. node_modules is not copied; run npm install there.
//
// Usage:
//   npm run import:code                  # default target: sibling folder
//   npm run import:code -- path/to/folder
//
// The target folder must not already exist (fresh export = no surprises).

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOC = path.join(ROOT, "docs", "FULL_CODE.md");

const arg = process.argv[2];
const TARGET = arg
  ? path.resolve(arg)
  : path.join(path.dirname(ROOT), "Default-Project-export");

function parseBlocks(mdPath) {
  const raw = fs.readFileSync(mdPath, "utf8");
  const lines = raw.split("\n");
  const files = []; // { path, content[], noNewline }
  let current = null;
  let inFence = false;
  let fenceOpener = "";

  for (const line of lines) {
    const header = line.match(/^### `(.+?)` — \d+ lines( \(no trailing newline\))?$/);
    if (header) {
      current = { rel: header[1], noNewline: Boolean(header[2]), content: [] };
      files.push(current);
      continue;
    }
    if (current) {
      if (!inFence) {
        if (line.startsWith("```")) {
          inFence = true;
          fenceOpener = line;
          continue;
        }
      } else {
        if (line === fenceOpener) {
          inFence = false;
          current = null;
        } else {
          current.content.push(line);
        }
      }
    }
  }
  return files;
}

function main() {
  if (!fs.existsSync(DOC)) {
    console.error(`❌ ${DOC} not found. Run npm run export:code first.`);
    process.exit(1);
  }
  if (fs.existsSync(TARGET)) {
    console.error(
      `❌ Target already exists: ${TARGET}\n   Choose a fresh folder so the export is guaranteed clean.`
    );
    process.exit(1);
  }

  const files = parseBlocks(DOC);
  if (files.length === 0) {
    console.error("❌ No files parsed from the export.");
    process.exit(1);
  }

  fs.mkdirSync(TARGET, { recursive: true });

  for (const { rel, content, noNewline } of files) {
    const abs = path.join(TARGET, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let out = content.join("\n");
    if (!noNewline && !out.endsWith("\n")) out += "\n";
    fs.writeFileSync(abs, out);
  }

  // Ready-to-configure .env for the new install (never export the real one).
  const example = path.join(TARGET, ".env.example");
  if (fs.existsSync(example) && !fs.existsSync(path.join(TARGET, ".env"))) {
    fs.copyFileSync(example, path.join(TARGET, ".env"));
  }

  console.log(`✅ Imported ${files.length} files into:\n   ${TARGET}`);
  console.log("");
  console.log("To run the exported project:");
  console.log("  1. cd into the folder above");
  console.log("  2. Edit .env → set BOT_TOKEN and ADMIN_TELEGRAM_ID");
  console.log("  3. npm install");
  console.log("  4. npx prisma db push && npx prisma generate");
  console.log("  5. npm run db:seed  (optional demo data)");
  console.log("  6. npm start       (or WEBHOOK_DOMAIN + npm run webhook:set)");
}

main();