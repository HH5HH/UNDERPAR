const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("workspace and popup surfaces import the shared console env badge stylesheet", () => {
  [
    "popup.css",
    "cm-workspace.css",
    "esm-workspace.css",
    "esm-health-workspace.css",
    "degradation-workspace.css",
    "blondie-time-workspace.css",
    "meg-workspace.css",
    "temp-pass-workspace.css",
  ].forEach((relativePath) => {
    assert.match(read(relativePath), /@import url\("underpar-env-badge\.css"\);/);
  });
});

test("shared env badge stylesheet defines the neutral console contract", () => {
  const source = read("underpar-env-badge.css");

  assert.match(source, /--underpar-env-badge-bg-top:\s*rgb\(248,\s*248,\s*248\);/i);
  assert.match(source, /--underpar-env-badge-bg-bottom:\s*rgb\(233,\s*233,\s*233\);/i);
  assert.match(source, /:is\(\.page-env-badge,\s*\.env-badge\)\s*\{[\s\S]*?border:\s*1px solid var\(--underpar-env-badge-border\);/i);
  assert.match(source, /:is\(\.page-env-badge-prefix,\s*\.env-badge-prefix\)\s*\{[\s\S]*?text-transform:\s*uppercase;/i);
  assert.match(source, /:is\(\.page-env-badge-value,\s*\.env-badge-value\)\s*\{[\s\S]*?font-weight:\s*600;/i);
});

test("temp pass workspace uses the shared env badge markup", () => {
  const html = read("temp-pass-workspace.html");

  assert.doesNotMatch(html, /page-env-badge-label/);
  assert.match(html, /page-env-badge-prefix/);
  assert.match(html, /page-env-badge-sep/);
});

test("legacy env badge recolors are removed from popup, Blondie, and MEG overrides", () => {
  const popupCss = read("popup.css");
  const blondieCss = read("blondie-time-workspace.css");
  const megCss = read("meg-workspace.css");

  assert.doesNotMatch(popupCss, /body\.underpar-up-tab \.page-env-badge\b/);
  assert.doesNotMatch(blondieCss, /ZIP dark x orange overrides for Blondie auxiliary surfaces\./);
  assert.doesNotMatch(megCss, /body:not\(\.meg-standalone-mode\) \.page-env-badge\b/);
  assert.doesNotMatch(megCss, /body\.meg-standalone-mode\[data-theme="retro"\] \.page-env-badge\b/);
  assert.doesNotMatch(megCss, /body\.meg-standalone-mode\[data-theme="modern"\] \.page-env-badge\b/);
});

test("standalone click views use the same neutral env badge treatment", () => {
  ["clickESM-template.html", "clickDGR-template.html", "scripts/clickESM.html"].forEach((relativePath) => {
    const source = read(relativePath);

    assert.match(
      source,
      /\.env-badge\s*\{[\s\S]*?background:\s*linear-gradient\(180deg,\s*rgb\(248,\s*248,\s*248\)\s*0%,\s*rgb\(233,\s*233,\s*233\)\s*100%\);/i
    );
    assert.match(
      source,
      /\.env-badge-prefix\s*\{[\s\S]*?background:\s*linear-gradient\(180deg,\s*rgb\(252,\s*252,\s*252\)\s*0%,\s*rgb\(239,\s*239,\s*239\)\s*100%\);/i
    );
    assert.match(source, /\.env-badge-value\s*\{[\s\S]*?font-weight:\s*600;/i);
  });
});
