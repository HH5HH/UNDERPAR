const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ADOBE_DEBUGGER_EXTENSION_IDS = new Set([
  "bfnnokhpnncpkdmbokanobigaccjkpob",
  "ocdmogmohccmeicdhlhhgepeaijenapj",
]);
const BANNED_DEBUGGER_LABELS = [
  /Adobe Experience Cloud Debugger/i,
  /Adobe Experience Platform Debugger/i,
  /Experience Cloud Debugger/i,
  /Experience Platform Debugger/i,
];

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function deriveChromeExtensionIdFromManifestKey(key) {
  const der = Buffer.from(String(key || "").trim(), "base64");
  const digest = crypto.createHash("sha256").update(der).digest();
  return [...digest.slice(0, 16)]
    .flatMap((byte) => [(byte >> 4) & 0x0f, byte & 0x0f])
    .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
    .join("");
}

test("manifest derives an UnderPAR-owned extension id", () => {
  const manifest = JSON.parse(readProjectFile("manifest.json"));
  const derivedExtensionId = deriveChromeExtensionIdFromManifestKey(manifest.key);

  assert.equal(manifest.name, "UnderPAR");
  assert.equal(manifest.action?.default_title, "UnderPAR");
  assert.match(String(manifest.description || ""), /UnderPAR/);
  assert.equal(ADOBE_DEBUGGER_EXTENSION_IDS.has(derivedExtensionId), false);
});

test("user-facing extension surfaces stay UnderPAR branded", () => {
  const userFacingFiles = [
    "manifest.json",
    "popup.html",
    "sidepanel.html",
    "devtools.html",
    "devtools.js",
    "up-devtools-panel.html",
    "up-devtools-panel.js",
  ];

  for (const relativePath of userFacingFiles) {
    const source = readProjectFile(relativePath);
    for (const pattern of BANNED_DEBUGGER_LABELS) {
      pattern.lastIndex = 0;
      assert.equal(pattern.test(source), false, `${relativePath} must not reference ${pattern}`);
    }
  }

  assert.match(readProjectFile("devtools.js"), /chrome\.devtools\.panels\.create\("UnderPAR"/);
  assert.match(readProjectFile("devtools.html"), /<title>UnderPAR DevTools<\/title>/);
  assert.match(readProjectFile("up-devtools-panel.html"), /<title>UnderPAR Settings<\/title>/);
});
