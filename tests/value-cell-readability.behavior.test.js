const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("shared JWT inspector keeps decoded value rows readable in narrow containers", () => {
  const source = read("underpar-jwt-inspector.css");

  assert.match(source, /\.up-jwt-object-section\s*\{[\s\S]*?container-type:\s*inline-size;/i);
  assert.match(
    source,
    /\.up-jwt-object-list\s*\{[\s\S]*?grid-template-columns:\s*minmax\(120px,\s*176px\)\s*minmax\(14rem,\s*1fr\);/i
  );
  assert.match(source, /\.up-jwt-object-list dd\s*\{[\s\S]*?overflow-wrap:\s*break-word;/i);
  assert.match(source, /\.up-jwt-object-list dd\s*\{[\s\S]*?word-break:\s*normal;/i);
  assert.match(source, /@container \(max-width:\s*380px\)\s*\{[\s\S]*?\.up-jwt-object-list\s*\{/i);
  assert.doesNotMatch(source, /\.up-jwt-object-list dd\s*\{[^}]*word-break:\s*break-all;/i);
});

test("registered app fallback JWT styles preserve readable summary and decoded values", () => {
  const source = read("registered-application-health-workspace.css");

  assert.match(source, /\.regapp-jwt-summary-value\s*\{[\s\S]*?overflow-wrap:\s*break-word;/i);
  assert.match(source, /\.regapp-jwt-summary-value\s*\{[\s\S]*?word-break:\s*normal;/i);
  assert.match(source, /\.regapp-jwt-object-section\s*\{[\s\S]*?container-type:\s*inline-size;/i);
  assert.match(
    source,
    /\.regapp-jwt-object-list\s*\{[\s\S]*?grid-template-columns:\s*minmax\(120px,\s*176px\)\s*minmax\(14rem,\s*1fr\);/i
  );
  assert.match(source, /\.regapp-jwt-object-list dd\s*\{[\s\S]*?overflow-wrap:\s*break-word;/i);
  assert.match(source, /@container \(max-width:\s*380px\)\s*\{[\s\S]*?\.regapp-jwt-object-list\s*\{/i);
});

test("CM, degradation, and devtools value cells avoid character-by-character wrapping", () => {
  const cmSource = read("cm-workspace.css");
  const degradationSource = read("degradation-workspace.css");
  const devtoolsSource = read("up-devtools-panel.css");

  assert.match(cmSource, /\.cm-cell-json\s*\{[\s\S]*?overflow-wrap:\s*break-word;/i);
  assert.match(cmSource, /\.cm-cell-json\s*\{[\s\S]*?word-break:\s*normal;/i);
  assert.doesNotMatch(cmSource, /\.cm-cell-json\s*\{[^}]*overflow-wrap:\s*anywhere;/i);
  assert.match(cmSource, /\.cm-json-row\s*\{[\s\S]*?container-type:\s*inline-size;/i);
  assert.match(cmSource, /@container \(max-width:\s*380px\)\s*\{[\s\S]*?\.cm-json-row--inline\s*\{/i);

  assert.match(degradationSource, /\.degradation-report-table td\s*\{[\s\S]*?overflow-wrap:\s*break-word;/i);
  assert.match(degradationSource, /\.degradation-report-table td\s*\{[\s\S]*?word-break:\s*normal;/i);

  assert.match(devtoolsSource, /\.context-row dd\s*\{[\s\S]*?overflow-wrap:\s*break-word;/i);
  assert.match(devtoolsSource, /\.context-row dd\s*\{[\s\S]*?word-break:\s*normal;/i);
  assert.match(devtoolsSource, /\.vault-entry-key\s*\{[\s\S]*?overflow-wrap:\s*break-word;/i);
});
