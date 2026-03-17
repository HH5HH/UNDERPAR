const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BANNED_PATTERNS = [/minnick@adobe\.com/gi, /@minnick\b/gi, /\bminnick\b/gi];
const TEXT_EXTENSIONS = new Set([".css", ".csv", ".html", ".js", ".json", ".php", ".svg", ".txt"]);

function listTrackedRuntimeFiles() {
  const output = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return output
    .split(/\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      if (
        entry.startsWith("tests/") ||
        entry.startsWith("docs/") ||
        entry.startsWith("scripts/") ||
        entry.startsWith(".git") ||
        entry.startsWith("ups/data/")
      ) {
        return false;
      }
      if (entry === "AGENTS.md" || entry === ".DS_Store" || entry.endsWith(".zip")) {
        return false;
      }
      return TEXT_EXTENSIONS.has(path.extname(entry).toLowerCase());
    });
}

test("tracked runtime source does not contain author-specific hard-coded identities", () => {
  const matches = [];
  const trackedFiles = listTrackedRuntimeFiles();

  for (const relativePath of trackedFiles) {
    const absolutePath = path.join(ROOT, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    for (const pattern of BANNED_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) {
        matches.push(relativePath);
        break;
      }
    }
  }

  assert.deepEqual(matches, []);
});
