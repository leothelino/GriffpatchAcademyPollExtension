function isGAHub() {
  return location.hostname === "hub.griffpatch.academy";
}

function isPollSite() {
  return (
    location.hostname === "speechless-parrot.github.io" &&
    location.pathname.startsWith("/ga-polls")
  );
}

let activeComposer = null;

/* =========================
   COMMON
========================= */

function isTextInput(el) {
  return !!el && (
    el.matches?.('textarea, input[type="text"], [contenteditable="true"]') ||
    el.isContentEditable
  );
}

function insertIntoInput(el, text) {
  el.focus();

  // Best match for "real typing/paste" behavior
  if (document.execCommand) {
    try {
      const ok = document.execCommand("insertText", false, text);
      if (ok) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    } catch (_) {}
  }

  // Fallback for textarea/input
  if (!el.isContentEditable && typeof el.value === "string") {
    if (typeof el.setRangeText === "function") {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.setRangeText(text, start, end, "end");
    } else {
      const value = el.value || "";
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      el.value = value.slice(0, start) + text + value.slice(end);
      const newPos = start + text.length;
      el.setSelectionRange?.(newPos, newPos);
    }

    try {
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: text,
        inputType: "insertText"
      }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  // Fallback for contenteditable
  if (el.isContentEditable) {
    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      el.textContent = (el.textContent || "") + text;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/* =========================
   GA SIDE
========================= */

function rememberFocusedComposer() {
  document.addEventListener("focusin", (e) => {
    if (isTextInput(e.target)) {
      activeComposer = e.target;
    }
  }, true);

  document.addEventListener("click", (e) => {
    if (isTextInput(e.target)) {
      activeComposer = e.target;
    }
  }, true);
}

function insertTextIntoComment(text) {
  const input = activeComposer && document.contains(activeComposer) ? activeComposer : null;

  if (!input) {
    alert("Use the poll button from the box you want to fill.");
    return false;
  }

  insertIntoInput(input, text);
  return true;
}

function closePollOverlay() {
  document.querySelector(".gp-poll-overlay")?.remove();
}

function openPollOverlay() {
  if (document.querySelector(".gp-poll-overlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "gp-poll-overlay";
  overlay.innerHTML = `
    <div class="gp-poll-container">
      <button class="gp-poll-close" type="button">&times;</button>
      <iframe
        src="https://speechless-parrot.github.io/ga-polls/"
        class="gp-poll-iframe"
        allow="clipboard-write"
      ></iframe>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector(".gp-poll-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

function createPollButton(targetInput) {
  const btn = document.createElement("button");
  btn.className = "comments-input-btn gp-poll-btn";
  btn.type = "button";
  btn.title = "Add Poll";
  btn.setAttribute("aria-label", "Add Poll");

  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 13V7M8 13V3M13 13V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  btn.addEventListener("click", () => {
    if (targetInput && document.contains(targetInput)) {
      activeComposer = targetInput;
      targetInput.focus();
    }
    openPollOverlay();
  });

  return btn;
}

function findTargetInputNearButton(button) {
  const candidates = [
    button.closest("form"),
    button.closest('[class*="comment"]'),
    button.closest('[class*="reply"]'),
    button.closest('[class*="composer"]'),
    button.closest('[class*="editor"]'),
    button.closest('[class*="input"]'),
    button.parentElement,
    button.parentElement?.parentElement,
    button.parentElement?.parentElement?.parentElement
  ].filter(Boolean);

  for (const container of candidates) {
    const input = container.querySelector('textarea, [contenteditable="true"], input[type="text"]');
    if (input) return input;
  }

  return null;
}

function isVideoButton(btn) {
  const title = (btn.getAttribute("title") || "").toLowerCase();
  const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
  const text = (btn.textContent || "").toLowerCase();

  return title.includes("video") || aria.includes("video") || text.includes("video");
}

function attachPollButtons() {
  const buttons = Array.from(document.querySelectorAll("button.comments-input-btn"));

  buttons.forEach((btn) => {
    if (btn.classList.contains("gp-poll-btn")) return;
    if (!isVideoButton(btn)) return;
    if (btn.nextElementSibling?.classList?.contains("gp-poll-btn")) return;

    const targetInput = findTargetInputNearButton(btn);
    if (!targetInput) return;

    btn.after(createPollButton(targetInput));
  });
}

function setupGAHub() {
  rememberFocusedComposer();

  window.addEventListener("message", (event) => {
    if (event.origin !== "https://speechless-parrot.github.io") return;

    const data = event.data;
    if (!data || data.type !== "GA_POLL_TEXT" || typeof data.text !== "string") return;

    const ok = insertTextIntoComment(data.text);
    if (ok) closePollOverlay();
  });

  attachPollButtons();

  const observer = new MutationObserver(() => {
    attachPollButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  setTimeout(attachPollButtons, 500);
  setTimeout(attachPollButtons, 1500);
  setTimeout(attachPollButtons, 3000);
}

/* =========================
   POLL SITE SIDE
========================= */

function getPollCode() {
  const pollPreview = document.getElementById("pollPreview");
  return pollPreview?.textContent?.trim() || "";
}

function sendPollToParent() {
  const pollCode = getPollCode();
  if (!pollCode) return;

  window.parent.postMessage(
    {
      type: "GA_POLL_TEXT",
      text: pollCode
    },
    "https://hub.griffpatch.academy"
  );
}

function setupPollSite() {
  const generateBtn = document.getElementById("generateBtn");
  if (!generateBtn) return;
  if (generateBtn.dataset.gpHooked === "1") return;

  generateBtn.dataset.gpHooked = "1";

  generateBtn.addEventListener("click", () => {
    setTimeout(() => {
      const pollCode = getPollCode();
      if (pollCode) {
        sendPollToParent();
      }
    }, 0);
  });
}

if (isGAHub()) {
  setupGAHub();
} else if (isPollSite()) {
  setupPollSite();
}
