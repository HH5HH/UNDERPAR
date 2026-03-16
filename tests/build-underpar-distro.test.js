const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT_PATH = path.join(ROOT, "scripts", "build_underpar_distro.sh");

function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("distribution build emits the canonical latest archive and folder name", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "underpar-distro-test-"));
  const repoDir = path.join(tempRoot, "repo");
  const scriptDir = path.join(repoDir, "scripts");
  const artifactPath = path.join(repoDir, "underpar_distro.zip");

  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  fs.mkdirSync(scriptDir, { recursive: true });
  fs.copyFileSync(SCRIPT_PATH, path.join(scriptDir, "build_underpar_distro.sh"));
  fs.chmodSync(path.join(scriptDir, "build_underpar_distro.sh"), 0o755);

  fs.writeFileSync(path.join(repoDir, "manifest.json"), '{ "version": "1.0.0" }\n');
  fs.writeFileSync(path.join(repoDir, "background.js"), 'console.log("underpar");\n');
  fs.writeFileSync(path.join(repoDir, ".DS_Store"), "ignore\n");
  fs.writeFileSync(path.join(repoDir, "UNDERPAR_DIST_v1.0.0.zip"), "legacy\n");
  fs.writeFileSync(path.join(repoDir, "ziptool_distro.zip"), "legacy\n");
  fs.writeFileSync(artifactPath, "stale\n");

  runCommand("git", ["init", "--quiet"], repoDir);
  runCommand("git", ["add", "scripts/build_underpar_distro.sh", "manifest.json", "background.js"], repoDir);

  const outputPath = runCommand("bash", ["scripts/build_underpar_distro.sh"], repoDir).trim();
  const archiveEntries = runCommand("unzip", ["-Z1", artifactPath], repoDir)
    .trim()
    .split(/\n+/)
    .filter(Boolean);

  assert.equal(fs.realpathSync(outputPath), fs.realpathSync(artifactPath));
  assert.equal(fs.existsSync(path.join(repoDir, "UNDERPAR_DIST_v1.0.0.zip")), false);
  assert.equal(fs.existsSync(path.join(repoDir, "ziptool_distro.zip")), false);
  assert.ok(fs.existsSync(artifactPath));
  assert.ok(archiveEntries.length > 0);
  assert.ok(
    archiveEntries.every((entry) => entry === "underpar-distro/" || entry.startsWith("underpar-distro/"))
  );
  assert.ok(archiveEntries.includes("underpar-distro/manifest.json"));
  assert.ok(archiveEntries.includes("underpar-distro/background.js"));
  assert.ok(archiveEntries.includes("underpar-distro/scripts/build_underpar_distro.sh"));
});
