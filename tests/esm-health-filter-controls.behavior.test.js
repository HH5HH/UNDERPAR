const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("esm health filter bar uses a select granularity control and removes the redundant pill strip", () => {
  const html = read("esm-health-workspace.html");
  const js = read("esm-health-workspace.js");
  const css = read("esm-health-workspace.css");

  assert.match(html, /id="workspace-granularity-select"/);
  assert.doesNotMatch(html, /workspace-granularity-group/);
  assert.doesNotMatch(html, /workspace-active-pills/);
  assert.match(html, /Reset to Context[\s\S]*workspace-granularity-select[\s\S]*Run Dashboard/);

  assert.match(js, /granularitySelect:\s*document\.getElementById\("workspace-granularity-select"\)/);
  assert.match(js, /function syncGranularitySelect\(\)/);
  assert.match(js, /els\.granularitySelect\.addEventListener\("change"/);
  assert.doesNotMatch(js, /renderActivePills/);
  assert.doesNotMatch(js, /Media Company/);

  assert.match(css, /\.esm-health-filter-actions\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(164px,\s*212px\) auto;/);
  assert.match(css, /\.esm-health-filter-select\s*\{/);
  assert.doesNotMatch(css, /\.esm-health-pill-row/);
});
