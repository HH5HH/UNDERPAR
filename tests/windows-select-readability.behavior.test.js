const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("popup shell forces readable native single-select popup colors on dark Windows surfaces", () => {
  const popupCss = read("popup.css");

  assert.match(popupCss, /--underpar-native-select-popup-bg:\s*var\(--spectrum-white,\s*#ffffff\);/i);
  assert.match(popupCss, /--underpar-native-select-popup-ink:\s*var\(--spectrum-gray-900,\s*#1d1d1d\);/i);
  assert.match(
    popupCss,
    /body\.underpar-up-tab select:not\(\[multiple\]\):not\(\[size\]\),[\s\S]*?body\.underpar-up-tab select:not\(\[multiple\]\)\[size="1"\]\s*\{\s*color-scheme:\s*light;/i
  );
  assert.match(
    popupCss,
    /body\.underpar-up-tab select:not\(\[multiple\]\):not\(\[size\]\) :is\(option, optgroup\),[\s\S]*?body\.underpar-up-tab select:not\(\[multiple\]\)\[size="1"\] :is\(option, optgroup\)\s*\{[\s\S]*?background:\s*var\(--underpar-native-select-popup-bg\);[\s\S]*?color:\s*var\(--underpar-native-select-popup-ink\);/i
  );
});

test("standalone ESM and DGR views force readable native single-select popup colors", () => {
  const clickDgr = read("clickDGR-template.html");
  const clickEsmTemplate = read("clickESM-template.html");
  const mirroredClickEsm = read("scripts/clickESM.html");

  assert.match(clickDgr, /--native-select-popup-bg:\s*var\(--spectrum-white,\s*#ffffff\);/i);
  assert.match(
    clickDgr,
    /#runnerForm select:not\(\[multiple\]\):not\(\[size\]\),[\s\S]*?#runnerForm select:not\(\[multiple\]\)\[size="1"\]\s*\{\s*color-scheme:\s*light;/i
  );

  [clickEsmTemplate, mirroredClickEsm].forEach((source) => {
    assert.match(source, /--native-select-popup-bg:var\(--spectrum-white,\s*#ffffff\);/i);
    assert.match(
      source,
      /select:not\(\[multiple\]\):not\(\[size\]\),[\s\S]*?select:not\(\[multiple\]\)\[size="1"\]\{\s*color-scheme:light;/i
    );
    assert.match(
      source,
      /select:not\(\[multiple\]\):not\(\[size\]\) :is\(option,optgroup\),[\s\S]*?select:not\(\[multiple\]\)\[size="1"\] :is\(option,optgroup\)\{[\s\S]*?background:var\(--native-select-popup-bg\);[\s\S]*?color:var\(--native-select-popup-ink\);/i
    );
  });
});

test("devtools environment picker forces a readable native popup palette", () => {
  const devtoolsCss = read("up-devtools-panel.css");

  assert.match(devtoolsCss, /--up-native-select-popup-bg:\s*var\(--spectrum-white,\s*#ffffff\);/i);
  assert.match(devtoolsCss, /\.env-select\s*\{[\s\S]*?color-scheme:\s*light;/i);
  assert.match(
    devtoolsCss,
    /\.env-select :is\(option, optgroup\)\s*\{[\s\S]*?background:\s*var\(--up-native-select-popup-bg\);[\s\S]*?color:\s*var\(--up-native-select-popup-ink\);/i
  );
});
