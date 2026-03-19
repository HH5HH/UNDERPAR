const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function readCssFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function extractLastCssBlock(source, selector) {
  const marker = `${selector} {`;
  const start = source.lastIndexOf(marker);
  assert.notEqual(start, -1, `Unable to locate selector ${selector}`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Unable to locate block start for ${selector}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }
  throw new Error(`Unterminated CSS block for ${selector}`);
}

[
  {
    file: "esm-workspace.css",
    selector: ".esm-table-wrapper",
    declarations: ["isolation: isolate;"],
  },
  {
    file: "esm-workspace.css",
    selector: ".esm-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "esm-workspace.css",
    selector: ".esm-table tfoot td",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "cm-workspace.css",
    selector: ".esm-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "cm-workspace.css",
    selector: ".esm-table tfoot td",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "mvpd-workspace.css",
    selector: ".mvpd-table-wrap",
    declarations: ["isolation: isolate;"],
  },
  {
    file: "mvpd-workspace.css",
    selector: ".mvpd-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "mvpd-workspace.css",
    selector: ".workspace-cards .esm-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "mvpd-workspace.css",
    selector: ".workspace-cards .esm-table tfoot td",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "degradation-workspace.css",
    selector: ".degradation-report-table-wrap",
    declarations: ["isolation: isolate;"],
  },
  {
    file: "degradation-workspace.css",
    selector: ".degradation-report-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "rest-workspace.css",
    selector: ".rest-report-table-wrap",
    declarations: ["isolation: isolate;"],
  },
  {
    file: "rest-workspace.css",
    selector: ".rest-report-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "rest-workspace.css",
    selector: ".rest-report-table thead th.active-sort",
    declarations: ["background-color:", "background-clip: padding-box;"],
  },
  {
    file: "meg-workspace.css",
    selector: ".meg-results-panel",
    declarations: ["isolation: isolate;"],
  },
  {
    file: "meg-workspace.css",
    selector: "#RAW_TBL thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "blondie-time-workspace.css",
    selector: ".bt-table-scroll",
    declarations: ["isolation: isolate;"],
  },
  {
    file: "blondie-time-workspace.css",
    selector: ".bt-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "blondie-time-workspace.css",
    selector: ".bt-table tfoot td",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "bobtools-workspace.css",
    selector: ".bobtools-splunk-table-wrap",
    declarations: ["isolation: isolate;"],
  },
  {
    file: "bobtools-workspace.css",
    selector: ".bobtools-splunk-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "ups/esm-workspace.css",
    selector: ".esm-table-wrapper",
    declarations: ["isolation: isolate;"],
  },
  {
    file: "ups/esm-workspace.css",
    selector: ".esm-table thead th",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
  {
    file: "ups/esm-workspace.css",
    selector: ".esm-table tfoot td",
    declarations: ["background-color:", "background-clip: padding-box;", "backdrop-filter: none;", "opacity: 1;"],
  },
].forEach(({ file, selector, declarations }) => {
  test(`${file} keeps ${selector} opaque`, () => {
    const block = extractLastCssBlock(readCssFile(file), selector);
    declarations.forEach((declaration) => {
      assert.match(block, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
  });
});
