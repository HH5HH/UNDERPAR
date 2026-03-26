const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("cm health filter bar uses a select granularity control and removes the redundant pill strip", () => {
  const html = read("cm-health-workspace.html");
  const js = read("cm-health-workspace.js");

  assert.match(html, /id="workspace-granularity-select"/);
  assert.doesNotMatch(html, /workspace-granularity-group/);
  assert.doesNotMatch(html, /workspace-active-pills/);
  assert.match(html, /Reset to Context[\s\S]*workspace-granularity-select[\s\S]*Run Dashboard/);

  assert.match(js, /granularitySelect:\s*document\.getElementById\("workspace-granularity-select"\)/);
  assert.match(js, /function syncGranularitySelect\(\)/);
  assert.match(js, /els\.granularitySelect\.addEventListener\("change"/);
  assert.doesNotMatch(js, /renderActivePills/);
  assert.doesNotMatch(js, /Media Company/);
});
