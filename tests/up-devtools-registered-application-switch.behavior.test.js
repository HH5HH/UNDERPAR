const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("UP DevTools owns the registered application switch UI and reuses the existing premium-service switch path", () => {
  const devtoolsHtml = read("up-devtools-panel.html");
  const devtoolsJs = read("up-devtools-panel.js");
  const devtoolsCss = read("up-devtools-panel.css");
  const popupSource = read("popup.js");
  const backgroundSource = read("background.js");

  assert.match(devtoolsHtml, /id="registered-applications-card"/);
  assert.match(devtoolsHtml, /id="registered-applications-context"/);
  assert.match(devtoolsHtml, /id="registered-applications-summary"/);
  assert.match(devtoolsHtml, /id="registered-applications-status"/);

  assert.match(devtoolsJs, /renderRegisteredApplicationsControlPanel\(/);
  assert.match(devtoolsJs, /data-premium-service-switcher/);
  assert.match(devtoolsJs, /data-registered-application-switch-apply/);
  assert.match(devtoolsJs, /sendVaultActionRequest\("switch-premium-service-application"/);
  assert.match(devtoolsJs, /setPendingRegisteredApplicationSwitch/);
  assert.match(devtoolsJs, /normalizeControlPanelPremiumServiceBindings/);
  assert.match(devtoolsJs, /normalizeControlPanelPremiumServiceOptions/);
  assert.match(devtoolsJs, /DEVTOOLS_PREMIUM_SERVICE_LABEL_BY_KEY/);
  assert.match(devtoolsJs, /function requestControllerStatusRefresh\(/);
  assert.match(devtoolsJs, /function clearRegisteredApplicationsSelection\(/);
  assert.match(devtoolsJs, /function bindControllerRealtimeListeners\(/);
  assert.match(devtoolsJs, /request-status-refresh/);
  assert.match(devtoolsJs, /Registered Applications unlock after a live ENV x Media Company selection is active in UnderPAR\./);
  assert.match(devtoolsJs, /registeredApplicationsCard\.classList\.toggle\("is-disabled", panelState\.controllerReady !== true \|\| !selectionReady\)/);
  assert.match(devtoolsJs, /connectControllerStatusPort\(\);/);
  assert.match(devtoolsJs, /bindControllerRealtimeListeners\(\);/);
  assert.match(devtoolsJs, /renderRegisteredApplicationsControlPanel\(panelState\.controllerStatusSnapshot \|\| null\)/);

  assert.match(devtoolsCss, /\.settings-grid/);
  assert.match(devtoolsCss, /\.settings-card--registered-apps/);
  assert.match(devtoolsCss, /\.regapp-control-summary-line/);
  assert.match(devtoolsCss, /\.regapp-service-pill--service-rest-v2/);

  assert.match(popupSource, /requestSource:\s*"up-devtools-control-panel"/);
  assert.match(popupSource, /function buildRegisteredApplicationHealthPremiumServiceSwitchState/);
  assert.match(popupSource, /premiumServiceOptions:\s*premiumServiceSwitchState\.premiumServiceOptions/);
  assert.match(popupSource, /requestSource:\s*"up-devtools-switch"/);
  assert.match(popupSource, /if \(action === "switch-premium-service-application"\)/);
  assert.match(popupSource, /prepareAdobePassEnvironmentSwitchUi\(targetEnvironment = null\)[\s\S]+void syncSidepanelControllerBridge\(true\);/);
  assert.match(popupSource, /function selectProgrammerForController\(programmer = null, controllerReason = "media-company-change"\)[\s\S]+void syncSidepanelControllerBridge\(true\);/);
  assert.match(popupSource, /message\.type === "request-session-state"/);
  assert.match(popupSource, /void syncSidepanelControllerBridge\(true\)/);

  assert.match(backgroundSource, /premiumServiceBindings:\s*Array\.isArray\(preferredState\?\.premiumServiceBindings\)/);
  assert.match(backgroundSource, /premiumServiceOptions:/);
  assert.match(backgroundSource, /function requestUnderparControllerStatusRefresh\(\)/);
  assert.match(backgroundSource, /message\.type !== "request-status-refresh"/);
  assert.match(backgroundSource, /type: "request-session-state"/);
});
