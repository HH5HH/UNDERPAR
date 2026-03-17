const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("UPSpace print stylesheet requests landscape and unpins the table chrome", () => {
  const source = read("ups/view.css");

  assert.match(source, /@page\s*\{[\s\S]*size:\s*landscape;/i);
  assert.match(source, /@media print[\s\S]*print-color-adjust:\s*exact;/i);
  assert.match(source, /@media print[\s\S]*\.ibeta-report-card \.esm-table\s*\{[\s\S]*table-layout:\s*fixed;/i);
  assert.match(source, /@media print[\s\S]*\.ibeta-report-card \.esm-table thead th,[\s\S]*position:\s*static !important;/i);
  assert.match(source, /@media print[\s\S]*\.ibeta-report-card \.esm-table th,[\s\S]*white-space:\s*normal !important;/i);
});

test("UPSpace narrow-screen layout keeps the report readable with horizontal table scrolling", () => {
  const source = read("ups/view.css");

  assert.match(source, /@media \(max-width:\s*900px\)[\s\S]*\.ups-utility-bar\s*\{[\s\S]*flex-wrap:\s*wrap;/i);
  assert.match(source, /@media \(max-width:\s*900px\)[\s\S]*\.ibeta-report-card \.esm-table-wrapper\s*\{[\s\S]*overflow-x:\s*auto;/i);
  assert.match(source, /@media \(max-width:\s*900px\)[\s\S]*\.ibeta-report-card \.esm-table\s*\{[\s\S]*min-width:\s*max-content;/i);
});
