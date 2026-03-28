const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("UnderPAR learning inspectors load the shared Adobe Pass decoder helper and expose SAML", () => {
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const workspaceHtml = fs.readFileSync(path.join(ROOT, "registered-application-health-workspace.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const jwtInspectorSource = fs.readFileSync(path.join(ROOT, "underpar-jwt-inspector.js"), "utf8");
  const helperSource = fs.readFileSync(path.join(ROOT, "adobe-pass-decode-helpers.js"), "utf8");

  assert.match(popupHtml, /adobe-pass-decode-helpers\.js/);
  assert.match(workspaceHtml, /adobe-pass-decode-helpers\.js/);
  assert.match(popupSource, /SAML Inspector/);
  assert.match(popupSource, /buildLearningInspectorCardHtml\("saml"\)/);
  assert.match(popupSource, /async function inspectLearningSamlInput\(\)/);
  assert.match(popupSource, /inspectSamlInput\(rawInput/);
  assert.match(popupSource, /resolveLearningBase64Inspection\(rawInput = ""\)[\s\S]*inspectBase64Value/s);
  assert.match(jwtInspectorSource, /AdobePassDecodeHelpers/);
  assert.match(jwtInspectorSource, /sharedDecodeHelpers/);
  assert.match(helperSource, /function decodeJwtToken\(token = ""\)/);
  assert.match(helperSource, /function inspectBase64Value\(rawInput = ""\)/);
  assert.match(helperSource, /async function decodeSamlValue\(fieldName = "", rawValue = ""\)/);
});
