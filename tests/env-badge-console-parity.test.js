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
    "degradation-workspace.css",
    "blondie-time-workspace.css",
    "meg-workspace.css",
    "temp-pass-workspace.css",
  ].forEach((relativePath) => {
    assert.match(read(relativePath), /@import url\("underpar-env-badge\.css"\);/);
  });
});

test("shared env badge stylesheet defines the colored release badge contract", () => {
  const source = read("underpar-env-badge.css");

  assert.doesNotMatch(source, /--underpar-env-badge-bg:\s*rgba\(255,\s*255,\s*255,\s*0\.98\);/i);
  assert.match(source, /:is\(\.page-env-badge,\s*\.env-badge\)\s*\{[\s\S]*?background:\s*transparent;/i);
  assert.match(source, /:is\(\.page-env-badge,\s*\.env-badge\)\s*\{[\s\S]*?box-shadow:\s*none;/i);
  assert.match(source, /\[data-environment-key="prequal-staging"\]/);
  assert.match(source, /\[data-environment-key="prequal-production"\]/);
  assert.match(source, /\[data-environment-key="release-production"\]/);
  assert.match(source, /\[data-environment-key="release-staging"\]/);
  assert.match(source, /:is\(\.page-env-badge-prefix,\s*\.env-badge-prefix\)\s*\{[\s\S]*?display:\s*none;/i);
  assert.match(source, /:is\(\.page-env-badge-value,\s*\.env-badge-value\)\s*\{[\s\S]*?border-radius:\s*999px;/i);
  assert.match(source, /:is\(\.page-env-badge-value,\s*\.env-badge-value\)\s*\{[\s\S]*?background:\s*var\(--underpar-env-badge-bg\);/i);
  assert.match(source, /:is\(\.page-env-badge-value,\s*\.env-badge-value\)\s*\{[\s\S]*?box-shadow:\s*var\(--underpar-env-badge-shadow\);/i);
  assert.match(source, /:is\(\.page-env-badge-value,\s*\.env-badge-value\)\s*\{[\s\S]*?font-weight:\s*700;/i);
  assert.match(source, /:is\(\.page-env-badge,\s*\.env-badge\):has\(:is\(\.page-env-badge-value,\s*\.env-badge-value\):empty\)\s*\{[\s\S]*?display:\s*none;/i);
});

test("temp pass workspace uses the shared env badge markup", () => {
  const html = read("temp-pass-workspace.html");

  assert.doesNotMatch(html, /page-env-badge-label/);
  assert.match(html, /page-env-badge-prefix/);
  assert.match(html, /page-env-badge-sep/);
});

test("popup and sidepanel env badge rows stay hidden until post-login context exists", () => {
  assert.match(read("popup.html"), /<div class="page-env-badge-row" hidden>/);
  assert.match(read("sidepanel.html"), /<div class="page-env-badge-row" hidden>/);
});

test("environment registry exposes a console-style release badge label helper", () => {
  const source = read("underpar-environment.js");

  assert.match(source, /function buildEnvironmentBadgeLabel\(environment\)/);
  assert.match(source, /return String\(resolved\?\.(?:badgeLabel|label)/);
  assert.match(source, /buildEnvironmentBadgeLabel,/);
  assert.match(source, /normalizedContext === "underpar" \|\| normalizedContext === "popup" \|\| normalizedContext === "sidepanel"/);
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

test("standalone click views use the same colored release badge treatment", () => {
  ["clickESM-template.html", "clickDGR-template.html", "scripts/clickESM.html"].forEach((relativePath) => {
    const source = read(relativePath);

    assert.match(source, /\.env-badge\s*\{[\s\S]*?background:\s*transparent;/i);
    assert.match(source, /\.env-badge\[data-environment-key="prequal-staging"\]/);
    assert.match(source, /\.env-badge\[data-environment-key="prequal-production"\]/);
    assert.match(source, /\.env-badge\[data-environment-key="release-production"\]/);
    assert.match(source, /\.env-badge\[data-environment-key="release-staging"\]/);
    assert.match(source, /\.env-badge-prefix\s*\{[\s\S]*?display:\s*none;/i);
    assert.match(source, /\.env-badge-value\s*\{[\s\S]*?border-radius:\s*999px;/i);
    assert.match(source, /\.env-badge-value\s*\{[\s\S]*?box-shadow:\s*var\(--env-badge-shadow\);/i);
    assert.match(source, /\.env-badge-value\s*\{[\s\S]*?font-weight:\s*700;/i);
  });
});
