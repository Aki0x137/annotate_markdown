(function () {
  const EXTENSION_ID = "Aki0x137.markdown-annotator";
  const COLORS = ["yellow", "green", "blue", "pink", "orange"];
  let toolbar;
  let popover;

  function resourceUri() {
    const meta = document.getElementById("vscode-markdown-preview-data");
    if (meta) {
      try {
        const settings = JSON.parse(meta.getAttribute("data-settings") || "{}");
        if (settings.source) {
          return settings.source;
        }
      } catch {
        // ignore
      }
      try {
        const state = JSON.parse(meta.getAttribute("data-state") || "{}");
        if (state.resource) {
          return state.resource;
        }
      } catch {
        // ignore
      }
    }
    return "";
  }

  // Real <a href="vscode://..."> clicks are trusted; the webview then intercepts them.
  // Programmatic a.click() is NOT trusted, so the iframe navigates to vscode:// and the preview dies.
  function actionHref(payload) {
    const query = new URLSearchParams({ data: JSON.stringify(payload) }).toString();
    return `vscode://${EXTENSION_ID}/apply?${query}`;
  }

  function actionLink(label, payload, className) {
    const a = document.createElement("a");
    a.className = className || "ann-action";
    a.textContent = label;
    a.href = actionHref(payload);
    a.title = label;
    return a;
  }

  function selectionContext() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      return undefined;
    }
    const text = sel.toString();
    if (!text.trim()) {
      return undefined;
    }
    const range = sel.getRangeAt(0);
    const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const lineEl = node && node.closest ? node.closest("[data-line], [data-line-start], .code-line") : null;
    const lineHint = lineEl ? Number(lineEl.getAttribute("data-line") || lineEl.getAttribute("data-line-start") || 0) : undefined;
    const full = (lineEl && lineEl.textContent) || "";
    const idx = full.indexOf(text);
    const prefix = idx > 0 ? full.slice(Math.max(0, idx - 24), idx) : "";
    const suffix = idx >= 0 ? full.slice(idx + text.length, idx + text.length + 24) : "";
    return { exact: text.slice(0, 500), prefix, suffix, lineHint, resource: resourceUri() };
  }

  function syncBodyContext() {
    try {
      const ctx = selectionContext();
      if (ctx) {
        document.body.setAttribute(
          "data-vscode-context",
          JSON.stringify({ webviewSection: "annotateMdSelection", ...ctx })
        );
      } else {
        document.body.removeAttribute("data-vscode-context");
      }
    } catch {
      // ignore
    }
  }

  function place(el, rect) {
    el.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    el.style.top = `${rect.bottom + window.scrollY + 6}px`;
  }

  function showToolbar() {
    syncBodyContext();
    const ctx = selectionContext();
    if (!ctx) {
      hideToolbar();
      return;
    }
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "ann-toolbar";
      toolbar.addEventListener("mousedown", (e) => e.preventDefault());
      document.body.appendChild(toolbar);
    }
    toolbar.replaceChildren();
    toolbar.appendChild(actionLink("Highlight", { action: "add", type: "highlight", color: "yellow", ...ctx }));
    for (const c of COLORS) {
      toolbar.appendChild(actionLink("", { action: "add", type: "highlight", color: c, ...ctx }, `ann-swatch ${c}`));
    }
    toolbar.appendChild(actionLink("Comment", { action: "add", type: "comment", ...ctx }));
    toolbar.appendChild(actionLink("Link", { action: "add", type: "link", ...ctx }));
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      hideToolbar();
      return;
    }
    place(toolbar, sel.getRangeAt(0).getBoundingClientRect());
    toolbar.style.display = "flex";
  }

  function hideToolbar() {
    if (toolbar) {
      toolbar.style.display = "none";
    }
  }

  function commentSource(mark) {
    const id = mark.getAttribute("data-ann-id");
    const attr = mark.getAttribute("data-ann-comment");
    if (attr) {
      return attr;
    }
    const src = mark.nextElementSibling;
    if (src && src.classList && src.classList.contains("ann-comment-src")) {
      return src.textContent || "";
    }
    if (id) {
      const byId = document.querySelector(`.ann-comment-src[data-ann-id="${CSS.escape(id)}"]`);
      if (byId) {
        return byId.textContent || "";
      }
    }
    return "";
  }

  function findMark(el) {
    if (!el || !el.closest) {
      return null;
    }
    const mark = el.closest("mark.ann");
    if (mark) {
      return mark;
    }
    const note = el.closest(".ann-inline-note, .ann-comment-src");
    if (!note) {
      return null;
    }
    const id = note.getAttribute("data-ann-id");
    return id ? document.querySelector(`mark.ann[data-ann-id="${CSS.escape(id)}"]`) : note.previousElementSibling;
  }

  function showPopover(mark) {
    if (!popover) {
      popover = document.createElement("div");
      popover.className = "ann-popover";
      popover.addEventListener("mousedown", (e) => e.preventDefault());
      document.body.appendChild(popover);
    }
    const id = mark.getAttribute("data-ann-id");
    const comment = commentSource(mark);
    const url = mark.getAttribute("data-ann-url") || "";
    const resource = resourceUri();
    popover.replaceChildren();

    const body = document.createElement("div");
    body.className = "ann-popover-comment";
    const note = document.querySelector(`.ann-inline-note[data-ann-id="${CSS.escape(id)}"]`);
    if (note) {
      body.append(...[...note.childNodes].map((n) => n.cloneNode(true)));
    } else if (comment) {
      body.textContent = comment;
    } else {
      body.textContent = "No comment yet.";
      body.classList.add("ann-popover-comment-empty");
    }
    popover.appendChild(body);

    if (url) {
      const a = document.createElement("a");
      a.className = "ann-popover-url";
      a.href = url;
      a.textContent = url;
      a.target = "_blank";
      a.rel = "noopener";
      popover.appendChild(a);
    }

    const actions = document.createElement("div");
    actions.className = "ann-popover-actions";
    for (const c of COLORS) {
      actions.appendChild(actionLink("", { action: "update", id, color: c, resource }, `ann-swatch ${c}`));
    }
    actions.appendChild(actionLink("Edit", { action: "editComment", id, resource }));
    actions.appendChild(actionLink("Delete", { action: "remove", id, resource }));
    popover.appendChild(actions);

    place(popover, (note || mark).getBoundingClientRect());
    popover.style.display = "flex";
  }

  function hidePopover() {
    if (popover) {
      popover.style.display = "none";
    }
  }

  document.addEventListener("selectionchange", syncBodyContext);
  document.addEventListener("mouseup", (e) => {
    if (toolbar && toolbar.contains(e.target)) {
      return;
    }
    if (popover && popover.contains(e.target)) {
      return;
    }
    setTimeout(showToolbar, 0);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") {
      hideToolbar();
      hidePopover();
    }
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!target || !target.closest) {
      return;
    }
    if (target.closest(".ann-toolbar, .ann-popover")) {
      return;
    }
    const mark = findMark(target);
    if (mark) {
      e.preventDefault();
      showPopover(mark);
      return;
    }
    hidePopover();
  });
})();
