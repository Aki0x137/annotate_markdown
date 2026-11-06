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

  function invoke(payload) {
    const query = new URLSearchParams({ data: JSON.stringify(payload) }).toString();
    const href = `vscode://${EXTENSION_ID}/apply?${query}`;
    const a = document.createElement("a");
    a.href = href;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    return { exact: text, prefix, suffix, lineHint, resource: resourceUri() };
  }

  function syncBodyContext() {
    const ctx = selectionContext();
    if (ctx) {
      document.body.setAttribute(
        "data-vscode-context",
        JSON.stringify({ webviewSection: "annotateMdSelection", ...ctx })
      );
    } else {
      document.body.removeAttribute("data-vscode-context");
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
      document.body.appendChild(toolbar);
    }
    toolbar.innerHTML = "";
    const highlight = document.createElement("button");
    highlight.textContent = "Highlight";
    highlight.addEventListener("click", () => {
      invoke({ action: "add", type: "highlight", ...ctx, color: "yellow" });
      hideToolbar();
    });
    toolbar.appendChild(highlight);
    for (const c of COLORS) {
      const sw = document.createElement("button");
      sw.className = `ann-swatch ${c}`;
      sw.title = c;
      sw.addEventListener("click", () => {
        invoke({ action: "add", type: "highlight", color: c, ...ctx });
        hideToolbar();
      });
      toolbar.appendChild(sw);
    }
    const comment = document.createElement("button");
    comment.textContent = "Comment";
    comment.addEventListener("click", () => {
      invoke({ action: "add", type: "comment", ...ctx });
      hideToolbar();
    });
    toolbar.appendChild(comment);
    const link = document.createElement("button");
    link.textContent = "Link";
    link.addEventListener("click", () => {
      invoke({ action: "add", type: "link", ...ctx });
      hideToolbar();
    });
    toolbar.appendChild(link);
    const range = window.getSelection().getRangeAt(0);
    place(toolbar, range.getBoundingClientRect());
    toolbar.style.display = "flex";
  }

  function hideToolbar() {
    if (toolbar) {
      toolbar.style.display = "none";
    }
  }

  function showPopover(mark) {
    if (!popover) {
      popover = document.createElement("div");
      popover.className = "ann-popover";
      document.body.appendChild(popover);
    }
    const id = mark.getAttribute("data-ann-id");
    const comment = mark.getAttribute("data-ann-comment") || "";
    const url = mark.getAttribute("data-ann-url") || "";
    const resource = resourceUri();
    popover.innerHTML = "";
    if (comment) {
      const p = document.createElement("div");
      p.textContent = comment;
      popover.appendChild(p);
    }
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.textContent = url;
      a.target = "_blank";
      popover.appendChild(a);
    }
    for (const c of COLORS) {
      const sw = document.createElement("button");
      sw.className = `ann-swatch ${c}`;
      sw.title = c;
      sw.addEventListener("click", () => {
        invoke({ action: "update", id, color: c, resource });
        hidePopover();
      });
      popover.appendChild(sw);
    }
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      invoke({ action: "remove", id, resource });
      hidePopover();
    });
    popover.appendChild(del);
    place(popover, mark.getBoundingClientRect());
    popover.style.display = "flex";
  }

  function hidePopover() {
    if (popover) {
      popover.style.display = "none";
    }
  }

  document.addEventListener("selectionchange", syncBodyContext);
  document.addEventListener("mouseup", () => {
    setTimeout(showToolbar, 0);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") {
      hideToolbar();
      hidePopover();
    }
  });
  document.addEventListener("click", (e) => {
    const mark = e.target && e.target.closest ? e.target.closest("mark.ann") : null;
    if (mark) {
      e.preventDefault();
      showPopover(mark);
      return;
    }
    if (toolbar && toolbar.contains(e.target)) {
      return;
    }
    if (popover && popover.contains(e.target)) {
      return;
    }
    hidePopover();
  });
})();
