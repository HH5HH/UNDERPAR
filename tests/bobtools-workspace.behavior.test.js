const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("BOBTOOLS profile rows expose row-level selection hooks and isolate delete clicks", () => {
  const source = read("bobtools-workspace.js");

  assert.match(
    source,
    /<li class="bobtools-profile-item\$\{active \? " is-active" : ""\}" data-profile-key="\$\{escapeHtml\(key\)\}" data-select-key="\$\{escapeHtml\(key\)\}">/
  );
  assert.match(
    source,
    /<div class="bobtools-profile-row" data-select-key="\$\{escapeHtml\(key\)\}">/
  );
  assert.match(source, /const selectBtn = target\.closest\("\[data-select-key\], \[data-profile-key\]"\);/);
  assert.match(source, /event\.stopPropagation\(\);[\s\S]*?void deleteProfile\(key\);/m);
});