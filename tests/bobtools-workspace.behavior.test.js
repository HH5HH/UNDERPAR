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
  const popupSource = read("popup.js");

  assert.match(
    source,
    /<li class="bobtools-profile-item\$\{active \? " is-active" : ""\}" data-profile-key="\$\{escapeHtml\(key\)\}" data-select-key="\$\{escapeHtml\(key\)\}">/
  );
  assert.match(
    source,
    /<div class="bobtools-profile-row" data-select-key="\$\{escapeHtml\(key\)\}">/
  );
  assert.doesNotMatch(source, /<button[^>]*class="bobtools-profile-select"[\s\S]*?<p class="bobtools-profile-title">/m);
  assert.match(source, /<button type="button" class="bobtools-profile-select"[\s\S]*?<span class="bobtools-profile-title">/m);
  assert.match(source, /const selectBtn = target\.closest\("\[data-select-key\], \[data-profile-key\]"\);/);
  assert.match(source, /event\.stopPropagation\(\);[\s\S]*?void deleteProfile\(key\);/m);
  assert.match(source, /void sendWorkspaceAction\("select-profile", \{[\s\S]*?harvestKey: key,[\s\S]*?\}\);/m);
  assert.match(popupSource, /bobtoolsWorkspaceSelectedHarvestKeyByWindowId: new Map\(\),/);
  assert.match(popupSource, /if \(action === "select-profile"\) \{[\s\S]*?setBobtoolsWorkspaceSelectedHarvestKey\(senderWindowId, harvestKey\);/m);
});