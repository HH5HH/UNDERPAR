(function attachUnderparBlondieSharePicker(globalScope) {
  function normalizeTargets(value = null) {
    const output = [];
    const seen = new Set();
    (Array.isArray(value) ? value : []).forEach((entry) => {
      const userId = String(entry?.userId || entry?.user_id || "").trim().toUpperCase();
      const label = String(entry?.label || entry?.userName || entry?.user_name || userId).trim();
      const isSelf = entry?.isSelf === true;
      if (!userId || !label || seen.has(userId)) {
        return;
      }
      seen.add(userId);
      output.push({
        userId,
        label,
        userName: String(entry?.userName || entry?.user_name || "").trim(),
        isSelf,
      });
    });
    output.sort((left, right) => {
      const selfDelta = Number(Boolean(right?.isSelf)) - Number(Boolean(left?.isSelf));
      if (selfDelta !== 0) {
        return selfDelta;
      }
      return String(left?.label || left?.userName || left?.userId || "").localeCompare(
        String(right?.label || right?.userName || right?.userId || ""),
        undefined,
        { sensitivity: "base" }
      );
    });
    return output;
  }

  function createController(options = {}) {
    const emptyTargetsMessage = String(options?.emptyTargetsMessage || "No pass-transition roster is cached yet.").trim();
    const emptyNoteMessage = String(options?.emptyNoteMessage || "Enter a Slack note before sending.").trim();
    const showHostStatus = typeof options?.showHostStatus === "function" ? options.showHostStatus : null;

    let picker = null;
    let context = null;
    let statusMessage = "";
    let statusIsError = false;

    function isOpen() {
      return !!(picker instanceof HTMLElement && !picker.hidden);
    }

    function isLoading() {
      return context?.loading === true;
    }

    function getTargets() {
      return Array.isArray(context?.targets) ? context.targets : [];
    }

    function setStatus(message = "", isError = false) {
      statusMessage = String(message || "").trim();
      statusIsError = Boolean(statusMessage) && isError === true;
    }

    function clearStatus() {
      statusMessage = "";
      statusIsError = false;
    }

    function moveFocusOutsidePicker(returnFocusTarget = null) {
      if (!(picker instanceof HTMLElement) || typeof document === "undefined") {
        return;
      }
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement) || !picker.contains(activeElement)) {
        return;
      }
      const candidate =
        returnFocusTarget instanceof HTMLElement
        && returnFocusTarget.isConnected
        && !picker.contains(returnFocusTarget)
        && typeof returnFocusTarget.focus === "function"
          ? returnFocusTarget
          : null;
      if (candidate) {
        try {
          candidate.focus({ preventScroll: true });
        } catch (_error) {
          try {
            candidate.focus();
          } catch (_innerError) {}
        }
      }
      if (picker.contains(document.activeElement)) {
        try {
          activeElement.blur();
        } catch (_error) {}
      }
    }

    function normalizeNoteText(value) {
      return String(value == null ? "" : value)
        .replace(/\r\n?/g, "\n")
        .replace(/\u00a0/g, " ")
        .trim();
    }

    function getInput() {
      const input = picker?.querySelector(".underpar-blondie-share-input");
      return input instanceof HTMLTextAreaElement ? input : null;
    }

    function getSelect() {
      const select = picker?.querySelector(".underpar-blondie-share-recipient-select");
      return select instanceof HTMLSelectElement ? select : null;
    }

    function syncUi() {
      const dialogOpen = isOpen();
      const loading = isLoading();
      const input = getInput();
      const select = getSelect();
      const noteText = normalizeNoteText(input?.value || "");
      const canSend = dialogOpen && getTargets().length > 0 && !!noteText && !loading;
      const sendButton = picker?.querySelector(".underpar-blondie-share-send");
      const closeButton = picker?.querySelector(".underpar-blondie-share-close");
      const sending = picker?.querySelector(".underpar-blondie-share-sending");
      const status = picker?.querySelector(".underpar-blondie-share-status");
      if (sendButton instanceof HTMLButtonElement) {
        sendButton.disabled = !canSend;
        sendButton.setAttribute("aria-busy", loading ? "true" : "false");
      }
      if (input) {
        input.disabled = loading;
      }
      if (select) {
        select.disabled = loading || getTargets().length === 0;
      }
      if (closeButton instanceof HTMLButtonElement) {
        closeButton.disabled = false;
      }
      if (status instanceof HTMLElement) {
        status.textContent = statusMessage;
        status.hidden = !(dialogOpen && statusMessage);
        status.classList.toggle("is-error", statusIsError);
      }
      if (sending instanceof HTMLElement) {
        sending.hidden = !loading;
      }
    }

    function setPickerOpenState(isOpenValue) {
      if (!(picker instanceof HTMLElement)) {
        return;
      }
      const nextOpen = isOpenValue === true;
      picker.hidden = !nextOpen;
      if ("inert" in picker) {
        picker.inert = !nextOpen;
      }
    }

    function close() {
      const returnFocusTarget = context?.anchorButton instanceof HTMLElement ? context.anchorButton : null;
      context = null;
      clearStatus();
      moveFocusOutsidePicker(returnFocusTarget);
      setPickerOpenState(false);
      const input = getInput();
      if (input) {
        input.value = "";
      }
      const select = getSelect();
      if (select) {
        select.selectedIndex = 0;
      }
      syncUi();
      if (returnFocusTarget && document.activeElement !== returnFocusTarget) {
        try {
          returnFocusTarget.focus({ preventScroll: true });
        } catch (_error) {
          try {
            returnFocusTarget.focus();
          } catch (_innerError) {}
        }
      }
    }

    function getSelectionState() {
      const input = getInput();
      if (!input || input.disabled) {
        return null;
      }
      const value = typeof input.value === "string" ? input.value : "";
      const max = value.length;
      const rawStart = Number.isFinite(input.selectionStart) ? Number(input.selectionStart) : max;
      const rawEnd = Number.isFinite(input.selectionEnd) ? Number(input.selectionEnd) : rawStart;
      const start = Math.max(0, Math.min(max, rawStart));
      const end = Math.max(start, Math.min(max, rawEnd));
      return {
        input,
        value,
        start,
        end,
        selected: value.slice(start, end),
      };
    }

    function replaceRange(start, end, replacement, nextSelectionStart, nextSelectionEnd) {
      const selection = getSelectionState();
      if (!selection) {
        return false;
      }
      const input = selection.input;
      const value = selection.value;
      const safeStart = Math.max(0, Math.min(value.length, Number(start) || 0));
      const safeEnd = Math.max(safeStart, Math.min(value.length, Number(end) || safeStart));
      const nextValue = value.slice(0, safeStart) + replacement + value.slice(safeEnd);
      input.value = nextValue;
      const max = nextValue.length;
      const defaultCursor = safeStart + replacement.length;
      const normalizedStart = Number.isFinite(nextSelectionStart)
        ? Math.max(0, Math.min(max, Number(nextSelectionStart)))
        : defaultCursor;
      const normalizedEnd = Number.isFinite(nextSelectionEnd)
        ? Math.max(normalizedStart, Math.min(max, Number(nextSelectionEnd)))
        : normalizedStart;
      try {
        input.focus();
        input.setSelectionRange(normalizedStart, normalizedEnd);
      } catch (_error) {}
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    function getLineContext(selectionState = null) {
      const selection = selectionState && typeof selectionState === "object" ? selectionState : getSelectionState();
      if (!selection) {
        return null;
      }
      const value = selection.value;
      const cursor = selection.start;
      const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
      const rawLineEnd = value.indexOf("\n", cursor);
      const lineEnd = rawLineEnd >= 0 ? rawLineEnd : value.length;
      return {
        lineStart,
        lineEnd,
        lineText: value.slice(lineStart, lineEnd),
        cursor,
      };
    }

    function parseListLine(lineText = "") {
      const line = String(lineText == null ? "" : lineText);
      const match = /^(\s*)([-*+•]|(\d+)\.)\s+(.*)$/.exec(line);
      if (!match) {
        return null;
      }
      const indent = match[1] || "";
      const markerToken = match[2] || "";
      const numberedValue = match[3] ? Number(match[3]) : NaN;
      const content = match[4] || "";
      return {
        indent,
        markerToken,
        markerPrefix: `${indent}${markerToken} `,
        numbered: Number.isFinite(numberedValue),
        numberedValue: Number.isFinite(numberedValue) ? Math.max(1, numberedValue) : 0,
        content,
      };
    }

    function handleListContinuationEnter() {
      const selection = getSelectionState();
      if (!selection || selection.start !== selection.end) {
        return false;
      }
      const lineContext = getLineContext(selection);
      if (!lineContext) {
        return false;
      }
      const listLine = parseListLine(lineContext.lineText);
      if (!listLine) {
        return false;
      }
      const lineContent = lineContext.lineText.slice(listLine.markerPrefix.length).trim();
      if (!lineContent) {
        return replaceRange(
          lineContext.lineStart,
          lineContext.lineStart + listLine.markerPrefix.length,
          "",
          lineContext.lineStart,
          lineContext.lineStart
        );
      }
      const nextMarker = listLine.numbered ? `${listLine.numberedValue + 1}. ` : `${listLine.markerToken === "•" ? "•" : "-"} `;
      const insertion = `\n${listLine.indent}${nextMarker}`;
      return replaceRange(
        selection.start,
        selection.end,
        insertion,
        selection.start + insertion.length,
        selection.start + insertion.length
      );
    }

    function applyWrappedSelection(prefix, suffix, placeholder, keepSelection) {
      const selection = getSelectionState();
      if (!selection) {
        return false;
      }
      const selected = selection.selected;
      const inner = selected || placeholder || "";
      const replacement = `${prefix}${inner}${suffix}`;
      const insertStart = selection.start + prefix.length;
      const insertEnd = insertStart + inner.length;
      if (selected || !keepSelection) {
        return replaceRange(
          selection.start,
          selection.end,
          replacement,
          selection.start + replacement.length,
          selection.start + replacement.length
        );
      }
      return replaceRange(selection.start, selection.end, replacement, insertStart, insertEnd);
    }

    function applyLinePrefix(prefix, numbered) {
      const selection = getSelectionState();
      if (!selection) {
        return false;
      }
      const value = selection.value;
      const lineStart = value.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
      const rawLineEnd = value.indexOf("\n", selection.end);
      const lineEnd = rawLineEnd >= 0 ? rawLineEnd : value.length;
      const block = value.slice(lineStart, lineEnd);
      const lines = block.split("\n");
      let count = 0;
      const replaced = lines
        .map((line) => {
          const stripped = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+|>\s+)?/, "");
          const content = stripped || "item";
          if (numbered) {
            count += 1;
            return `${count}. ${content}`;
          }
          return `${prefix}${content}`;
        })
        .join("\n");
      return replaceRange(lineStart, lineEnd, replaced, lineStart, lineStart + replaced.length);
    }

    function looksLikeUrl(value) {
      return /^(https?:\/\/|www\.)/i.test(String(value || "").trim());
    }

    function normalizeUrl(value) {
      const normalized = String(value || "").replace(/\s+/g, "").trim();
      if (!normalized) {
        return "";
      }
      if (/^https?:\/\//i.test(normalized)) {
        return normalized;
      }
      return `https://${normalized}`;
    }

    function applyLinkFormat() {
      const selection = getSelectionState();
      if (!selection) {
        return false;
      }
      const selected = String(selection.selected || "").trim();
      const linkTextPlaceholder = "your text here";
      const linkTargetPlaceholder = "the link";
      let label = linkTextPlaceholder;
      let url = linkTargetPlaceholder;
      let nextSelectionStart = selection.start + 1;
      let nextSelectionEnd = nextSelectionStart + label.length;
      if (selected && looksLikeUrl(selected)) {
        url = normalizeUrl(selected);
      } else if (selected) {
        label = selected;
        nextSelectionStart = selection.start + label.length + 3;
        nextSelectionEnd = nextSelectionStart + url.length;
      }
      const replacement = `[${label}](${url})`;
      return replaceRange(selection.start, selection.end, replacement, nextSelectionStart, nextSelectionEnd);
    }

    function applyToolbarAction(action = "") {
      const command = String(action || "").trim().toLowerCase();
      if (!command) {
        return false;
      }
      let changed = false;
      if (command === "code") {
        changed = applyWrappedSelection("`", "`", "code", true);
      } else if (command === "codeblock") {
        changed = applyWrappedSelection("```\n", "\n```", "code block", true);
      } else if (command === "bulleted") {
        changed = applyLinePrefix("- ", false);
      } else if (command === "quote") {
        changed = applyLinePrefix("> ", false);
      } else if (command === "link") {
        changed = applyLinkFormat();
      }
      if (changed && statusMessage) {
        clearStatus();
      }
      if (changed) {
        syncUi();
      }
      return changed;
    }

    async function handleSendClick() {
      if (!context) {
        close();
        return;
      }
      const noteText = normalizeNoteText(getInput()?.value || "");
      if (!noteText) {
        setStatus(emptyNoteMessage, true);
        syncUi();
        return;
      }
      const select = getSelect();
      if (!(select instanceof HTMLSelectElement)) {
        return;
      }
      const selectedUserId = String(select.value || "").trim().toUpperCase();
      const selectedTarget = getTargets().find((entry) => entry.userId === selectedUserId) || null;
      if (!selectedTarget) {
        setStatus(emptyTargetsMessage, true);
        syncUi();
        return;
      }
      const pendingContext = context;
      pendingContext.loading = true;
      clearStatus();
      syncUi();
      try {
        const result = await pendingContext.onSelect({
          selectedTarget,
          noteText,
        });
        if (result?.ok === false) {
          setStatus(result.error || "Slack send failed.", true);
          syncUi();
          return;
        }
        close();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Slack send failed.", true);
        syncUi();
      } finally {
        if (context) {
          context.loading = false;
          syncUi();
        }
      }
    }

    function ensurePicker() {
      if (picker instanceof HTMLElement) {
        return picker;
      }

      const nextPicker = document.createElement("div");
      nextPicker.className = "underpar-blondie-share-dialog-backdrop";
      nextPicker.hidden = true;
      if ("inert" in nextPicker) {
        nextPicker.inert = true;
      }
      nextPicker.innerHTML = `
        <div class="underpar-blondie-share-dialog" role="dialog" aria-modal="true" aria-label="Share :blondiebtn: receipt">
          <div class="underpar-blondie-share-recipient-field">
            <div class="underpar-blondie-share-recipient-head">
              <label class="underpar-blondie-share-recipient-label" for="underparBlondieShareRecipientSelect">pass-transition teammate</label>
              <button type="button" class="underpar-blondie-share-close" aria-label="Close Slack note dialog">&times;</button>
            </div>
            <select
              id="underparBlondieShareRecipientSelect"
              class="underpar-blondie-share-recipient-select"
              aria-label="Choose a pass-transition teammate"
            ></select>
          </div>
          <label class="underpar-blondie-share-visually-hidden" for="underparBlondieShareInput">Slack message</label>
          <div class="underpar-blondie-share-editor-shell">
            <div class="underpar-blondie-share-toolbar" role="toolbar" aria-label="Format Slack note">
              <button class="underpar-blondie-share-tool" type="button" data-slack-format="link" aria-label="Insert link">&#128279;</button>
              <button class="underpar-blondie-share-tool" type="button" data-slack-format="bulleted" aria-label="Bulleted list">&#8226;</button>
              <button class="underpar-blondie-share-tool" type="button" data-slack-format="quote" aria-label="Quote">&gt;</button>
              <span class="underpar-blondie-share-tool-sep" aria-hidden="true"></span>
              <button class="underpar-blondie-share-tool" type="button" data-slack-format="code" aria-label="Inline code">&lt;/&gt;</button>
              <button class="underpar-blondie-share-tool" type="button" data-slack-format="codeblock" aria-label="Code block">{ }</button>
            </div>
            <textarea
              id="underparBlondieShareInput"
              class="underpar-blondie-share-input"
              rows="6"
              placeholder="Type your personal Slack note..."
            ></textarea>
            <div class="underpar-blondie-share-editor-footer">
              <button type="button" class="underpar-blondie-share-send">SEND</button>
            </div>
          </div>
          <div class="underpar-blondie-share-status" aria-live="polite" hidden></div>
          <span class="underpar-blondie-share-sending" aria-live="polite" hidden>Sending...</span>
        </div>
      `;
      document.body.appendChild(nextPicker);
      nextPicker.addEventListener("pointerdown", (event) => {
        if (event.target !== nextPicker) {
          return;
        }
        event.preventDefault();
        close();
      });
      nextPicker.querySelector(".underpar-blondie-share-dialog")?.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      nextPicker.querySelector(".underpar-blondie-share-close")?.addEventListener("click", () => {
        close();
      });
      nextPicker.querySelector(".underpar-blondie-share-send")?.addEventListener("click", () => {
        handleSendClick();
      });

      const input = nextPicker.querySelector(".underpar-blondie-share-input");
      if (input instanceof HTMLTextAreaElement) {
        input.addEventListener("input", () => {
          if (statusMessage) {
            clearStatus();
          }
          syncUi();
        });
        input.addEventListener("keydown", (event) => {
          if ((event.metaKey || event.ctrlKey) && !event.altKey) {
            const key = String(event.key || "").toLowerCase();
            if (key === "k") {
              event.preventDefault();
              applyToolbarAction("link");
              return;
            }
          }
          if (event.key !== "Enter") {
            return;
          }
          if (event.isComposing) {
            return;
          }
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            nextPicker.querySelector(".underpar-blondie-share-send")?.click();
            return;
          }
          if (event.shiftKey || event.altKey) {
            return;
          }
          if (handleListContinuationEnter()) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          nextPicker.querySelector(".underpar-blondie-share-send")?.click();
        });
      }

      nextPicker.querySelector(".underpar-blondie-share-dialog")?.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-slack-format]") : null;
        if (!target) {
          return;
        }
        event.preventDefault();
        applyToolbarAction(target.getAttribute("data-slack-format"));
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      });

      picker = nextPicker;
      return picker;
    }

    function open({ anchorButton, onSelect, targets, selfUserId } = {}) {
      if (!(anchorButton instanceof HTMLButtonElement) || typeof onSelect !== "function") {
        return false;
      }
      const normalizedTargets = normalizeTargets(targets);
      if (!normalizedTargets.length) {
        if (showHostStatus) {
          showHostStatus(emptyTargetsMessage, "error");
        }
        return false;
      }
      ensurePicker();
      const select = getSelect();
      if (!(select instanceof HTMLSelectElement)) {
        return false;
      }
      select.replaceChildren(
        ...normalizedTargets.map((entry) => {
          const option = document.createElement("option");
          option.value = entry.userId;
          option.textContent = entry.label;
          return option;
        })
      );
      const normalizedSelfUserId = String(selfUserId || "").trim().toUpperCase();
      const selfIndex = normalizedTargets.findIndex(
        (entry) => entry?.isSelf === true || entry?.userId === normalizedSelfUserId
      );
      select.selectedIndex = selfIndex >= 0 && selfIndex < select.options.length ? selfIndex : 0;
      context = {
        anchorButton,
        onSelect,
        targets: normalizedTargets,
        loading: false,
      };
      clearStatus();
      const input = getInput();
      if (input) {
        input.value = "";
      }
      setPickerOpenState(true);
      syncUi();
      if (input) {
        window.setTimeout(() => {
          if (!isOpen()) {
            return;
          }
          try {
            input.focus();
          } catch (_error) {}
        }, 0);
      }
      return true;
    }

    return {
      close,
      isOpen,
      open,
    };
  }

  globalScope.UnderParBlondieSharePicker = {
    createController,
    normalizeTargets,
  };
})(globalThis);
