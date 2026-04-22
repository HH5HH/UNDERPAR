const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function extractFunctionSource(source, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start !== -1) {
      break;
    }
  }
  assert.notEqual(start, -1, `Unable to locate ${functionName}`);
  const paramsStart = source.indexOf("(", start);
  assert.notEqual(paramsStart, -1, `Unable to locate params for ${functionName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") paramsDepth += 1;
    if (char === ")") {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `Unable to locate body for ${functionName}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unterminated function: ${functionName}`);
}

test("popup env badge render stores the active environment metadata used for redraws", () => {
  const popupSource = read("popup.js");
  const renderSource = extractFunctionSource(popupSource, "renderPageEnvironmentBadge");

  assert.match(renderSource, /const environmentKey = String\(environment\?\.key \|\| DEFAULT_ADOBEPASS_ENVIRONMENT\.key\)/);
  assert.match(renderSource, /els\.pageEnvBadge\.dataset\.environmentKey = environmentKey;/);
  assert.match(renderSource, /els\.pageEnvBadge\.dataset\.environmentLabel = badgeLabel;/);
});

test("environment switch redraw happens immediately after applying the new environment", () => {
  const popupSource = read("popup.js");
  const switchSource = extractFunctionSource(popupSource, "switchAdobePassEnvironmentInPlace");

  assert.match(switchSource, /applyAdobePassEnvironment\(targetEnvironment\);\s*renderBuildInfo\(\);\s*prepareAdobePassEnvironmentSwitchUi\(targetEnvironment\);\s*render\(\);/);
});

test("environment-switch rerun handlers consume the fresh environment payload before rerunning", () => {
  const esmSource = read("esm-workspace.js");
  const cmSource = read("cm-workspace.js");
  const megSource = read("meg-workspace.js");
  const tempPassSource = read("temp-pass-workspace.js");
  const degradationSource = read("degradation-workspace.js");

  assert.match(esmSource, /if \(event === "environment-switch-rerun"\) \{[\s\S]*?applyWorkspaceAdobePassEnvironment\(payload\.adobePassEnvironment\);/);
  assert.match(cmSource, /if \(event === "environment-switch-rerun"\) \{[\s\S]*?applyWorkspaceAdobePassEnvironment\(payload\.adobePassEnvironment\);/);
  assert.match(megSource, /function applyWorkspaceEnvironmentFromEventPayload\(payload = \{\}\)/);
  assert.match(megSource, /if \(normalizedEvent === "environment-switch-rerun"\) \{[\s\S]*?applyWorkspaceEnvironmentFromEventPayload\(payload\);/);
  assert.match(tempPassSource, /if \(event === "environment-switch-rerun"\) \{[\s\S]*?state\.adobePassEnvironment = [\s\S]*?renderWorkspaceEnvironmentBadge\(\);/);
  assert.match(degradationSource, /if \(event === "environment-switch-rerun"\) \{[\s\S]*?state\.adobePassEnvironment = resolveWorkspaceAdobePassEnvironment\(payload\.adobePassEnvironment\);[\s\S]*?renderWorkspaceEnvironmentBadge\(\);/);
});

test("environment-switch restore and media-company changes both converge on hydrateProgrammerSelection", () => {
  const popupSource = read("popup.js");
  const applySnapshotSource = extractFunctionSource(popupSource, "applyGlobalSelectionSnapshot");
  const flushSelectionSource = extractFunctionSource(popupSource, "flushPendingMediaCompanySelectionHydration");

  assert.match(applySnapshotSource, /const restoredProgrammer = await hydrateProgrammerSelection\(programmer,\s*\{/);
  assert.match(flushSelectionSource, /void hydrateProgrammerSelection\(selectedProgrammer,\s*\{/);
});

test("workspace badge renderers persist current environment identity for redraw verification", () => {
  const sources = [
    read("esm-workspace.js"),
    read("cm-workspace.js"),
    read("temp-pass-workspace.js"),
    read("degradation-workspace.js"),
    read("meg-workspace.js"),
    read("blondie-time-workspace.js"),
  ].join("\n");

  assert.match(sources, /dataset\.environmentKey/);
  assert.match(sources, /dataset\.environmentLabel/);
});
