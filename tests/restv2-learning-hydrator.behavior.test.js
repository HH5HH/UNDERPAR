const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");

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

function loadHydrator(globals = {}) {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "runRestV2InteractiveDocsHydrator"),
    "module.exports = { runRestV2InteractiveDocsHydrator };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URLSearchParams,
    Date,
    Promise,
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.runRestV2InteractiveDocsHydrator;
}

function createDomHarness(operationId) {
  class Event {
    constructor(type, init = {}) {
      this.type = String(type || "");
      this.bubbles = Boolean(init.bubbles);
    }
  }

  class HTMLElement {
    constructor(tagName = "div", options = {}) {
      this.tagName = String(tagName || "div").toUpperCase();
      this.attributes = new Map();
      this.children = [];
      this.parentElement = null;
      this.ownerDocument = null;
      this._textContent = String(options.textContent || "");
      this.className = String(options.className || "");
      this.id = String(options.id || "");
      this.value = Object.prototype.hasOwnProperty.call(options, "value") ? String(options.value || "") : "";
      this.focused = false;
      this.clicked = false;
      this.dispatchedEvents = [];
      if (this.className) {
        this.setAttribute("class", this.className);
      }
      if (this.id) {
        this.setAttribute("id", this.id);
      }
      Object.entries(options.attributes || {}).forEach(([key, value]) => {
        this.setAttribute(key, value);
      });
    }

    appendChild(child) {
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
      if (typeof child._propagateOwnerDocument === "function") {
        child._propagateOwnerDocument(this.ownerDocument);
      }
      return child;
    }

    _propagateOwnerDocument(ownerDocument) {
      this.ownerDocument = ownerDocument;
      this.children.forEach((child) => {
        if (typeof child._propagateOwnerDocument === "function") {
          child._propagateOwnerDocument(ownerDocument);
        }
      });
    }

    setAttribute(name, value) {
      const key = String(name || "");
      const normalizedValue = String(value || "");
      this.attributes.set(key, normalizedValue);
      if (key === "id") {
        this.id = normalizedValue;
      }
      if (key === "class") {
        this.className = normalizedValue;
      }
    }

    getAttribute(name) {
      return this.attributes.has(String(name || "")) ? this.attributes.get(String(name || "")) : null;
    }

    get textContent() {
      return `${this._textContent}${this.children.map((child) => child.textContent).join("")}`;
    }

    set textContent(value) {
      this._textContent = String(value || "");
    }

    contains(candidate) {
      if (!candidate) {
        return false;
      }
      if (candidate === this) {
        return true;
      }
      return this.children.some((child) => child.contains(candidate));
    }

    focus() {
      this.focused = true;
      if (this.ownerDocument) {
        this.ownerDocument.activeElement = this;
      }
    }

    click() {
      this.clicked = true;
      if (typeof this.onClick === "function") {
        this.onClick();
      }
    }

    dispatchEvent(event) {
      this.dispatchedEvents.push(event);
      return true;
    }

    scrollIntoView() {}

    matches(selector) {
      const trimmed = String(selector || "").trim();
      if (!trimmed) {
        return false;
      }
      if (trimmed === "*") {
        return true;
      }
      if (trimmed.startsWith(".")) {
        const className = trimmed.slice(1);
        return this.className.split(/\s+/).filter(Boolean).includes(className);
      }
      const attrMatch = trimmed.match(/^\[([^=\]]+)="([^"]*)"\]$/);
      if (attrMatch) {
        return String(this.getAttribute(attrMatch[1]) || "") === attrMatch[2];
      }
      if (trimmed === "input:not([type])") {
        return this.tagName === "INPUT" && !this.getAttribute("type");
      }
      const typedTagMatch = trimmed.match(/^([a-z0-9-]+)\[([^=\]]+)="([^"]*)"\]$/i);
      if (typedTagMatch) {
        return (
          this.tagName === typedTagMatch[1].toUpperCase() &&
          String(this.getAttribute(typedTagMatch[2]) || "") === typedTagMatch[3]
        );
      }
      return this.tagName === trimmed.toUpperCase();
    }

    querySelectorAll(selector) {
      const selectors = String(selector || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const matches = [];
      const visit = (node) => {
        node.children.forEach((child) => {
          if (selectors.some((candidate) => child.matches(candidate))) {
            matches.push(child);
          }
          visit(child);
        });
      };
      visit(this);
      return matches;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  class HTMLInputElement extends HTMLElement {
    constructor(options = {}) {
      super("input", options);
      if (Object.prototype.hasOwnProperty.call(options, "type") && options.type) {
        this.setAttribute("type", options.type);
      }
    }
  }

  class HTMLTextAreaElement extends HTMLElement {
    constructor(options = {}) {
      super("textarea", options);
    }
  }

  class HTMLOptionElement extends HTMLElement {
    constructor(options = {}) {
      super("option", options);
      this.value = String(options.value || "");
      this.textContent = String(options.textContent || options.label || "");
    }
  }

  class HTMLSelectElement extends HTMLElement {
    constructor(options = {}) {
      super("select", options);
      this.value = String(options.value || "");
    }

    get options() {
      return this.children.filter((child) => child instanceof HTMLOptionElement);
    }
  }

  class FakeDocument {
    constructor(root) {
      this.root = root;
      this.activeElement = null;
    }

    getElementById(id) {
      const targetId = String(id || "");
      const stack = [this.root];
      while (stack.length > 0) {
        const node = stack.shift();
        if (String(node.id || "") === targetId) {
          return node;
        }
        stack.push(...node.children);
      }
      return null;
    }
  }

  const root = new HTMLElement("main");
  const document = new FakeDocument(root);
  root._propagateOwnerDocument(document);
  const operationElement = root.appendChild(
    new HTMLElement("section", {
      id: `operation/${operationId}`,
    })
  );
  operationElement.appendChild(new HTMLElement("h2", { textContent: `Operation ${operationId}` }));

  const createElement = (tagName, options = {}) => {
    switch (String(tagName || "").toLowerCase()) {
      case "input":
        return new HTMLInputElement(options);
      case "select":
        return new HTMLSelectElement(options);
      case "textarea":
        return new HTMLTextAreaElement(options);
      case "option":
        return new HTMLOptionElement(options);
      default:
        return new HTMLElement(tagName, options);
    }
  };

  return {
    document,
    operationElement,
    location: { hash: "" },
    window: { setTimeout },
    Event,
    HTMLElement,
    HTMLInputElement,
    HTMLSelectElement,
    HTMLTextAreaElement,
    createElement,
  };
}

test("REST V2 docs hydrator clicks Try it and waits for mounted controls before filling UnderPAR context", async () => {
  const harness = createDomHarness("handleRequestUsingGET");
  const { createElement, operationElement } = harness;
  const tryItButton = operationElement.appendChild(
    createElement("button", {
      textContent: "Try it",
      attributes: { "data-cy": "try-it" },
    })
  );
  const refs = {};
  tryItButton.onClick = () => {
    setTimeout(() => {
      const serviceProviderRow = operationElement.appendChild(
        createElement("div", {
          textContent: "serviceProvider",
          attributes: { "data-param-name": "serviceProvider", "data-param-in": "path" },
        })
      );
      refs.serviceProviderInput = serviceProviderRow.appendChild(createElement("input", { type: "text" }));
      refs.authorizationInput = operationElement.appendChild(
        createElement("input", {
          type: "text",
          attributes: { name: "header.Authorization" },
        })
      );
      refs.sendButton = operationElement.appendChild(
        createElement("button", {
          textContent: "Send",
          attributes: { "data-cy": "send-button" },
        })
      );
    }, 25);
  };

  const runRestV2InteractiveDocsHydrator = loadHydrator({
    document: harness.document,
    location: harness.location,
    window: harness.window,
    Event: harness.Event,
    HTMLElement: harness.HTMLElement,
    HTMLInputElement: harness.HTMLInputElement,
    HTMLSelectElement: harness.HTMLSelectElement,
    HTMLTextAreaElement: harness.HTMLTextAreaElement,
  });

  const result = await runRestV2InteractiveDocsHydrator({
    operationId: "handleRequestUsingGET",
    fieldValues: {
      "path.serviceProvider": "Turner",
      "header.Authorization": "Bearer token-123",
    },
    requiredFields: ["path.serviceProvider", "header.Authorization"],
    missingRequiredFields: [],
    timeoutMs: 2000,
  });

  assert.equal(tryItButton.clicked, true);
  assert.equal(refs.serviceProviderInput.value, "Turner");
  assert.equal(refs.authorizationInput.value, "Bearer token-123");
  assert.equal(refs.sendButton.focused, true);
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.filledFields).sort(), ["header.Authorization", "path.serviceProvider"]);
  assert.deepEqual(Array.from(result.unresolvedRequiredFields), []);
  assert.equal(result.sendButtonFound, true);
  assert.equal(result.currentHash, "#operation/handleRequestUsingGET");
});

test("REST V2 docs hydrator still clicks Try it when a send button shell exists before the request controls mount", async () => {
  const harness = createDomHarness("getProfilesUsingGET_1");
  const { createElement, operationElement } = harness;
  const sendButton = operationElement.appendChild(
    createElement("button", {
      textContent: "Send",
      attributes: { "data-cy": "send-button" },
    })
  );
  const tryItButton = operationElement.appendChild(
    createElement("button", {
      textContent: "Try it",
      attributes: { "data-cy": "try-it" },
    })
  );
  const refs = {};
  tryItButton.onClick = () => {
    setTimeout(() => {
      const serviceProviderRow = operationElement.appendChild(
        createElement("div", {
          textContent: "serviceProvider",
          attributes: { "data-param-name": "serviceProvider", "data-param-in": "path" },
        })
      );
      refs.serviceProviderInput = serviceProviderRow.appendChild(createElement("input", { type: "text" }));
    }, 25);
  };

  const runRestV2InteractiveDocsHydrator = loadHydrator({
    document: harness.document,
    location: harness.location,
    window: harness.window,
    Event: harness.Event,
    HTMLElement: harness.HTMLElement,
    HTMLInputElement: harness.HTMLInputElement,
    HTMLSelectElement: harness.HTMLSelectElement,
    HTMLTextAreaElement: harness.HTMLTextAreaElement,
  });

  const result = await runRestV2InteractiveDocsHydrator({
    operationId: "getProfilesUsingGET_1",
    fieldValues: {
      "path.serviceProvider": "Turner",
    },
    requiredFields: ["path.serviceProvider"],
    missingRequiredFields: [],
    timeoutMs: 2000,
  });

  assert.equal(tryItButton.clicked, true);
  assert.equal(refs.serviceProviderInput.value, "Turner");
  assert.equal(sendButton.focused, true);
  assert.equal(result.ok, true);
});

test("REST V2 docs hydrator merges body fields into a JSON request-body editor when standalone controls are absent", async () => {
  const harness = createDomHarness("retrieveAuthorizeDecisionsForMvpdUsingPOST");
  const { createElement, operationElement } = harness;
  const sendButton = operationElement.appendChild(
    createElement("button", {
      textContent: "Send",
      attributes: { "data-cy": "send-button" },
    })
  );
  const serviceProviderInput = operationElement.appendChild(
    createElement("input", {
      type: "text",
      attributes: { name: "path.serviceProvider" },
    })
  );
  const bodyWrapper = operationElement.appendChild(
    createElement("div", {
      textContent: "Request body",
    })
  );
  const editorElement = bodyWrapper.appendChild(
    createElement("div", {
      className: "CodeMirror",
      attributes: { "aria-label": "Request body" },
    })
  );
  let editorValue = JSON.stringify({ existing: "keep-me" }, null, 2);
  editorElement.CodeMirror = {
    getValue() {
      return editorValue;
    },
    setValue(nextValue) {
      editorValue = String(nextValue || "");
    },
    save() {},
  };

  const runRestV2InteractiveDocsHydrator = loadHydrator({
    document: harness.document,
    location: harness.location,
    window: harness.window,
    Event: harness.Event,
    HTMLElement: harness.HTMLElement,
    HTMLInputElement: harness.HTMLInputElement,
    HTMLSelectElement: harness.HTMLSelectElement,
    HTMLTextAreaElement: harness.HTMLTextAreaElement,
  });

  const result = await runRestV2InteractiveDocsHydrator({
    operationId: "retrieveAuthorizeDecisionsForMvpdUsingPOST",
    fieldValues: {
      "path.serviceProvider": "Turner",
      "header.Content-Type": "application/json",
      "body.mvpd": "Comcast_SSO",
      "body.resources": ["urn:adobe:test-resource-1", "urn:adobe:test-resource-2"],
    },
    requiredFields: ["path.serviceProvider", "body.mvpd", "body.resources"],
    missingRequiredFields: [],
    timeoutMs: 1200,
  });

  const parsedEditorValue = JSON.parse(editorValue);
  assert.equal(serviceProviderInput.value, "Turner");
  assert.deepEqual(parsedEditorValue, {
    existing: "keep-me",
    mvpd: "Comcast_SSO",
    resources: ["urn:adobe:test-resource-1", "urn:adobe:test-resource-2"],
  });
  assert.equal(sendButton.focused, true);
  assert.equal(result.ok, true);
  assert.equal(result.filledFields.includes("body.mvpd"), true);
  assert.equal(result.filledFields.includes("body.resources"), true);
  assert.deepEqual(Array.from(result.unresolvedRequiredFields), []);
});

test("REST V2 docs hydrator waits for a delayed live-style request-body editor before hydrating body resources", async () => {
  const harness = createDomHarness("retrieveAuthorizeDecisionsForMvpdUsingPOST");
  const { createElement, operationElement } = harness;
  const tryItButton = operationElement.appendChild(
    createElement("button", {
      textContent: "Try it",
      attributes: { "data-cy": "try-it" },
    })
  );
  const refs = {};
  let editorValue = JSON.stringify({ resources: ["string"] }, null, 2);
  tryItButton.onClick = () => {
    setTimeout(() => {
      refs.sendButton = operationElement.appendChild(
        createElement("button", {
          textContent: "Send",
          attributes: { "data-cy": "send-button" },
        })
      );
      refs.serviceProviderInput = operationElement.appendChild(
        createElement("input", {
          type: "text",
          attributes: { name: "path.serviceProvider" },
        })
      );
      refs.mvpdInput = operationElement.appendChild(
        createElement("input", {
          type: "text",
          attributes: { name: "path.mvpd" },
        })
      );
    }, 25);
    setTimeout(() => {
      const bodyWrapper = operationElement.appendChild(
        createElement("div", {
          attributes: { "data-cy": "console-request-body" },
        })
      );
      const reactCodeMirror = bodyWrapper.appendChild(
        createElement("div", {
          className: "react-codemirror2",
        })
      );
      refs.editorElement = reactCodeMirror.appendChild(
        createElement("div", {
          className: "CodeMirror cm-s-material",
          attributes: { "aria-label": "Request body" },
        })
      );
      refs.editorElement.appendChild(
        createElement("textarea", {
          attributes: {
            tabindex: "0",
            style: "position: absolute; bottom: -1em; width: 1000px; height: 1em;",
          },
        })
      );
      refs.editorElement.CodeMirror = {
        getValue() {
          return editorValue;
        },
        setValue(nextValue) {
          editorValue = String(nextValue || "");
        },
        save() {},
      };
    }, 4200);
  };

  const runRestV2InteractiveDocsHydrator = loadHydrator({
    document: harness.document,
    location: harness.location,
    window: harness.window,
    Event: harness.Event,
    HTMLElement: harness.HTMLElement,
    HTMLInputElement: harness.HTMLInputElement,
    HTMLSelectElement: harness.HTMLSelectElement,
    HTMLTextAreaElement: harness.HTMLTextAreaElement,
  });

  const result = await runRestV2InteractiveDocsHydrator({
    operationId: "retrieveAuthorizeDecisionsForMvpdUsingPOST",
    fieldValues: {
      "path.serviceProvider": "Turner",
      "path.mvpd": "Comcast_SSO",
      "header.Content-Type": "application/json",
      "body.resources": ["1234", "NBALP", "TMSIDX"],
    },
    requiredFields: ["path.serviceProvider", "path.mvpd", "body.resources"],
    missingRequiredFields: [],
    timeoutMs: 6000,
  });

  assert.equal(tryItButton.clicked, true);
  assert.equal(refs.serviceProviderInput.value, "Turner");
  assert.equal(refs.mvpdInput.value, "Comcast_SSO");
  assert.deepEqual(JSON.parse(editorValue), {
    resources: ["1234", "NBALP", "TMSIDX"],
  });
  assert.equal(refs.sendButton.focused, true);
  assert.equal(result.ok, true);
  assert.equal(result.filledFields.includes("body.resources"), true);
  assert.deepEqual(Array.from(result.unresolvedRequiredFields), []);
});

test("REST V2 docs hydrator prefers the request-body editor over a mislabeled nearby select for body resources", async () => {
  const harness = createDomHarness("retrieveAuthorizeDecisionsForMvpdUsingPOST");
  const { createElement, operationElement } = harness;
  const sendButton = operationElement.appendChild(
    createElement("button", {
      textContent: "Send",
      attributes: { "data-cy": "send-button" },
    })
  );
  operationElement.appendChild(
    createElement("input", {
      type: "text",
      attributes: { name: "path.serviceProvider" },
    })
  );
  operationElement.appendChild(
    createElement("input", {
      type: "text",
      attributes: { name: "path.mvpd" },
    })
  );
  const bodyWrapper = operationElement.appendChild(
    createElement("div", {
      textContent: "Target server Body resources",
      attributes: { "data-cy": "console-request-body" },
    })
  );
  const misleadingSelect = bodyWrapper.appendChild(
    createElement("select", {
      className: "dropdown-select",
      value: "https://sp.auth.adobe.com/api/v2",
    })
  );
  misleadingSelect.appendChild(
    createElement("option", {
      value: "https://sp.auth.adobe.com/api/v2",
      textContent: "https://sp.auth.adobe.com/api/v2",
    })
  );
  const reactCodeMirror = bodyWrapper.appendChild(
    createElement("div", {
      className: "react-codemirror2",
    })
  );
  const editorElement = reactCodeMirror.appendChild(
    createElement("div", {
      className: "CodeMirror cm-s-material",
      attributes: { "aria-label": "Request body" },
    })
  );
  let editorValue = JSON.stringify({ resources: ["string"] }, null, 2);
  editorElement.CodeMirror = {
    getValue() {
      return editorValue;
    },
    setValue(nextValue) {
      editorValue = String(nextValue || "");
    },
    save() {},
  };

  const runRestV2InteractiveDocsHydrator = loadHydrator({
    document: harness.document,
    location: harness.location,
    window: harness.window,
    Event: harness.Event,
    HTMLElement: harness.HTMLElement,
    HTMLInputElement: harness.HTMLInputElement,
    HTMLSelectElement: harness.HTMLSelectElement,
    HTMLTextAreaElement: harness.HTMLTextAreaElement,
  });

  const result = await runRestV2InteractiveDocsHydrator({
    operationId: "retrieveAuthorizeDecisionsForMvpdUsingPOST",
    fieldValues: {
      "path.serviceProvider": "Turner",
      "path.mvpd": "Comcast_SSO",
      "header.Content-Type": "application/json",
      "body.resources": ["1234", "NBALP", "TMSIDX"],
    },
    requiredFields: ["path.serviceProvider", "path.mvpd", "body.resources"],
    missingRequiredFields: [],
    timeoutMs: 1200,
  });

  assert.equal(misleadingSelect.value, "https://sp.auth.adobe.com/api/v2");
  assert.deepEqual(JSON.parse(editorValue), {
    resources: ["1234", "NBALP", "TMSIDX"],
  });
  assert.equal(sendButton.focused, true);
  assert.equal(result.ok, true);
  assert.equal(result.filledFields.includes("body.resources"), true);
  assert.deepEqual(Array.from(result.unresolvedRequiredFields), []);
});

test("REST V2 docs hydrator serializes form-encoded body fields into a textarea request editor", async () => {
  const harness = createDomHarness("createSessionUsingPOST");
  const { createElement, operationElement } = harness;
  operationElement.appendChild(
    createElement("button", {
      textContent: "Send",
      attributes: { "data-cy": "send-button" },
    })
  );
  operationElement.appendChild(
    createElement("input", {
      type: "text",
      attributes: { name: "path.serviceProvider" },
    })
  );
  const bodyContainer = operationElement.appendChild(
    createElement("div", {
      textContent: "Request body",
    })
  );
  const bodyEditor = bodyContainer.appendChild(
    createElement("textarea", {
      attributes: { "aria-label": "Request body editor" },
    })
  );

  const runRestV2InteractiveDocsHydrator = loadHydrator({
    document: harness.document,
    location: harness.location,
    window: harness.window,
    Event: harness.Event,
    HTMLElement: harness.HTMLElement,
    HTMLInputElement: harness.HTMLInputElement,
    HTMLSelectElement: harness.HTMLSelectElement,
    HTMLTextAreaElement: harness.HTMLTextAreaElement,
  });

  const result = await runRestV2InteractiveDocsHydrator({
    operationId: "createSessionUsingPOST",
    fieldValues: {
      "path.serviceProvider": "Turner",
      "header.Content-Type": "application/x-www-form-urlencoded",
      "body.domainName": "experience.example.test",
      "body.redirectUrl": "https://experience.example.test/callback",
    },
    requiredFields: ["path.serviceProvider", "body.domainName", "body.redirectUrl"],
    missingRequiredFields: [],
    timeoutMs: 1200,
  });

  assert.equal(
    bodyEditor.value,
    "domainName=experience.example.test&redirectUrl=https%3A%2F%2Fexperience.example.test%2Fcallback"
  );
  assert.equal(result.ok, true);
  assert.equal(result.filledFields.includes("body.domainName"), true);
  assert.equal(result.filledFields.includes("body.redirectUrl"), true);
  assert.deepEqual(Array.from(result.unresolvedRequiredFields), []);
});

test("REST V2 docs hydrator does not treat an unrelated textarea as a request-body editor", async () => {
  const harness = createDomHarness("createPartnerProfileUsingPOST");
  const { createElement, operationElement } = harness;
  operationElement.appendChild(
    createElement("button", {
      textContent: "Send",
      attributes: { "data-cy": "send-button" },
    })
  );
  operationElement.appendChild(
    createElement("input", {
      type: "text",
      attributes: { name: "path.serviceProvider" },
    })
  );
  const notesArea = operationElement.appendChild(
    createElement("textarea", {
      attributes: { "aria-label": "Notes" },
    })
  );

  const runRestV2InteractiveDocsHydrator = loadHydrator({
    document: harness.document,
    location: harness.location,
    window: harness.window,
    Event: harness.Event,
    HTMLElement: harness.HTMLElement,
    HTMLInputElement: harness.HTMLInputElement,
    HTMLSelectElement: harness.HTMLSelectElement,
    HTMLTextAreaElement: harness.HTMLTextAreaElement,
  });

  const result = await runRestV2InteractiveDocsHydrator({
    operationId: "createPartnerProfileUsingPOST",
    fieldValues: {
      "path.serviceProvider": "Turner",
      "header.Content-Type": "application/x-www-form-urlencoded",
      "body.SAMLResponse": "encoded-saml-response",
    },
    requiredFields: ["path.serviceProvider", "body.SAMLResponse"],
    missingRequiredFields: [],
    timeoutMs: 1200,
  });

  assert.equal(notesArea.value, "");
  assert.equal(result.ok, false);
  assert.equal(result.missingControls.includes("body.SAMLResponse"), true);
  assert.deepEqual(Array.from(result.unresolvedRequiredFields), ["body.SAMLResponse"]);
});

test("REST V2 docs hydrator maps the TempPASS identity header across casing variants", async () => {
  const harness = createDomHarness("getProfileForMvpdUsingGET");
  const { createElement, operationElement } = harness;
  operationElement.appendChild(
    createElement("button", {
      textContent: "Send",
      attributes: { "data-cy": "send-button" },
    })
  );
  operationElement.appendChild(
    createElement("input", {
      type: "text",
      attributes: { name: "path.serviceProvider" },
    })
  );
  operationElement.appendChild(
    createElement("input", {
      type: "text",
      attributes: { name: "header.AP-TempPass-Identity" },
    })
  );

  const runRestV2InteractiveDocsHydrator = loadHydrator({
    document: harness.document,
    location: harness.location,
    window: harness.window,
    Event: harness.Event,
    HTMLElement: harness.HTMLElement,
    HTMLInputElement: harness.HTMLInputElement,
    HTMLSelectElement: harness.HTMLSelectElement,
    HTMLTextAreaElement: harness.HTMLTextAreaElement,
  });

  const result = await runRestV2InteractiveDocsHydrator({
    operationId: "getProfileForMvpdUsingGET",
    fieldValues: {
      "path.serviceProvider": "Turner",
      "header.AP-Temppass-Identity": "encoded-temp-pass-identity",
    },
    requiredFields: ["path.serviceProvider"],
    missingRequiredFields: [],
    timeoutMs: 1200,
  });

  const tempPassInput = operationElement.querySelector('[name="header.AP-TempPass-Identity"]');
  assert.equal(tempPassInput.value, "encoded-temp-pass-identity");
  assert.equal(result.ok, true);
  assert.equal(result.filledFields.includes("header.AP-Temppass-Identity"), true);
});
