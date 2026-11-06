import * as vscode from "vscode";
import { AnnotationStore } from "../store/annotationStore";
import { Annotation, COLORS, ColorName } from "../store/types";
import { createAnchor, offsetToLine, resolveAnchor } from "../anchoring/anchor";
import { uuid } from "../id";
import { AnnotationsTreeProvider } from "../editor/treeView";
import { AnnotationDecorations } from "../editor/decorations";

export interface PreviewPayload {
  action?: "add" | "update" | "remove";
  id?: string;
  type?: Annotation["type"];
  color?: ColorName;
  comment?: string;
  url?: string;
  exact?: string;
  prefix?: string;
  suffix?: string;
  lineHint?: number;
  resource?: string | vscode.Uri;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  store: AnnotationStore,
  tree: AnnotationsTreeProvider,
  decorations: AnnotationDecorations
): void {
  const refresh = async (uri: vscode.Uri) => {
    tree.refresh();
    await decorations.refresh(uri);
    await vscode.commands.executeCommand("markdown.preview.refresh");
  };

  const requireTrusted = (): boolean => {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage("Editing annotations requires a trusted workspace.");
      return false;
    }
    return true;
  };

  const applyPayload = async (payload: PreviewPayload | undefined): Promise<void> => {
    if (!requireTrusted() || !payload) {
      return;
    }
    const uri = resolveResourceUri(payload.resource);
    if (!uri) {
      return;
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    if (payload.action === "remove" && payload.id) {
      await store.remove(uri, payload.id);
      await refresh(uri);
      return;
    }
    if (payload.action === "update" && payload.id) {
      const anns = await store.list(uri);
      const target = anns.find((a) => a.id === payload.id);
      if (!target) {
        return;
      }
      if (payload.color) {
        target.color = payload.color;
      }
      if (payload.comment !== undefined) {
        target.comment = payload.comment;
      }
      if (payload.url !== undefined) {
        target.url = payload.url;
      }
      target.updatedAt = new Date().toISOString();
      await store.upsert(uri, target);
      await refresh(uri);
      return;
    }
    if (!payload.exact) {
      return;
    }
    let comment = payload.comment;
    if (payload.type === "comment" && comment === undefined) {
      comment = await vscode.window.showInputBox({ prompt: "Comment" });
      if (comment === undefined) {
        return;
      }
    }
    let url = payload.url;
    if (payload.type === "link" && !url) {
      url = await vscode.window.showInputBox({ prompt: "URL (https://...)" });
      if (!url) {
        return;
      }
    }
    const source = doc.getText();
    const hit = resolveAnchor(source, {
      exact: payload.exact,
      prefix: payload.prefix ?? "",
      suffix: payload.suffix ?? "",
      lineHint: payload.lineHint,
    });
    const cfg = vscode.workspace.getConfiguration("annotateMd");
    const now = new Date().toISOString();
    const annotation: Annotation = {
      id: uuid(),
      type: payload.type ?? (comment ? "comment" : url ? "link" : "highlight"),
      color: payload.color ?? (cfg.get<ColorName>("defaultColor") || "yellow"),
      comment,
      url,
      createdAt: now,
      updatedAt: now,
      author: cfg.get<string>("author") || undefined,
      anchor: hit
        ? createAnchor(source, hit.start, hit.end, payload.lineHint ?? offsetToLine(source, hit.start))
        : {
            exact: payload.exact,
            prefix: payload.prefix ?? "",
            suffix: payload.suffix ?? "",
            lineHint: payload.lineHint,
          },
      status: hit ? "active" : "orphaned",
    };
    await store.upsert(uri, annotation);
    await refresh(uri);
  };

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        const params = new URLSearchParams(uri.query);
        const data = params.get("data");
        const payload: PreviewPayload = data
          ? (JSON.parse(data) as PreviewPayload)
          : (Object.fromEntries(params.entries()) as unknown as PreviewPayload);
        await applyPayload(payload);
      },
    }),
    vscode.commands.registerCommand("annotateMd.highlightSelection", async (ctx?: PreviewPayload) => {
      if (!requireTrusted()) {
        return;
      }
      if (ctx?.exact) {
        await applyPayload({ ...ctx, action: "add", type: "highlight" });
        return;
      }
      await createFromEditor(store, "highlight");
    }),
    vscode.commands.registerCommand("annotateMd.addComment", async (ctx?: PreviewPayload) => {
      if (!requireTrusted()) {
        return;
      }
      if (ctx?.exact) {
        await applyPayload({ ...ctx, action: "add", type: "comment" });
        return;
      }
      const comment = await vscode.window.showInputBox({ prompt: "Comment" });
      if (comment === undefined) {
        return;
      }
      await createFromEditor(store, "comment", { comment });
    }),
    vscode.commands.registerCommand("annotateMd.attachLink", async (ctx?: PreviewPayload) => {
      if (!requireTrusted()) {
        return;
      }
      if (ctx?.exact) {
        await applyPayload({ ...ctx, action: "add", type: "link" });
        return;
      }
      const url = await vscode.window.showInputBox({ prompt: "URL" });
      if (!url) {
        return;
      }
      await createFromEditor(store, "link", { url });
    }),
    vscode.commands.registerCommand("annotateMd.setColor", async (item?: PreviewPayload) => {
      if (!requireTrusted()) {
        return;
      }
      const uri = resolveResourceUri(item?.resource);
      if (!uri) {
        return;
      }
      const color = item?.color ?? (await pickColor());
      if (!color) {
        return;
      }
      const anns = await store.list(uri);
      const id = item?.id ?? (await pickAnnotation(anns))?.id;
      const target = anns.find((a) => a.id === id);
      if (!target) {
        return;
      }
      target.color = color;
      target.updatedAt = new Date().toISOString();
      await store.upsert(uri, target);
      await refresh(uri);
    }),
    vscode.commands.registerCommand("annotateMd.editComment", async (item?: PreviewPayload) => {
      if (!requireTrusted()) {
        return;
      }
      const uri = resolveResourceUri(item?.resource);
      if (!uri) {
        return;
      }
      const anns = await store.list(uri);
      const target = anns.find((a) => a.id === item?.id) ?? (await pickAnnotation(anns));
      if (!target) {
        return;
      }
      const comment = await vscode.window.showInputBox({ prompt: "Comment", value: target.comment ?? "" });
      if (comment === undefined) {
        return;
      }
      target.comment = comment;
      target.type = comment ? "comment" : target.type;
      target.updatedAt = new Date().toISOString();
      await store.upsert(uri, target);
      await refresh(uri);
    }),
    vscode.commands.registerCommand("annotateMd.removeAnnotation", async (item?: PreviewPayload) => {
      if (!requireTrusted()) {
        return;
      }
      const uri = resolveResourceUri(item?.resource);
      if (!uri) {
        return;
      }
      const anns = await store.list(uri);
      const id = item?.id ?? (await pickAnnotation(anns))?.id;
      if (!id) {
        return;
      }
      await store.remove(uri, id);
      await refresh(uri);
    }),
    vscode.commands.registerCommand("annotateMd.goToAnnotation", async (item?: { id?: string; resource?: vscode.Uri | string }) => {
      const uri = resolveResourceUri(item?.resource);
      if (!uri) {
        return;
      }
      const anns = await store.list(uri);
      const target = anns.find((a) => a.id === item?.id) ?? (await pickAnnotation(anns));
      if (!target) {
        return;
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      const source = doc.getText();
      const hit = resolveAnchor(source, target.anchor);
      const editor = await vscode.window.showTextDocument(doc);
      if (hit) {
        const start = doc.positionAt(hit.start);
        const end = doc.positionAt(hit.end);
        editor.selection = new vscode.Selection(start, end);
        editor.revealRange(new vscode.Range(start, end));
      } else {
        void vscode.window.showWarningMessage("This annotation is orphaned. Use Re-attach to fix it.");
      }
    }),
    vscode.commands.registerCommand("annotateMd.showAnnotations", async () => {
      await vscode.commands.executeCommand("annotateMd.annotations.focus");
    }),
    vscode.commands.registerCommand("annotateMd.applyFromPreview", async (raw?: PreviewPayload | string) => {
      const payload = typeof raw === "string" ? (JSON.parse(decodeURIComponent(raw)) as PreviewPayload) : raw;
      await applyPayload(payload);
    }),
    vscode.commands.registerCommand("annotateMd.reanchor", async (item?: { id?: string }) => {
      if (!requireTrusted()) {
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        void vscode.window.showInformationMessage("Select the text to re-attach, then run this command.");
        return;
      }
      const anns = await store.list(editor.document.uri);
      const target = anns.find((a) => a.id === item?.id) ?? (await pickAnnotation(anns.filter((a) => a.status === "orphaned")));
      if (!target) {
        return;
      }
      const source = editor.document.getText();
      const start = editor.document.offsetAt(editor.selection.start);
      const end = editor.document.offsetAt(editor.selection.end);
      target.anchor = createAnchor(source, start, end, offsetToLine(source, start));
      target.status = "active";
      target.updatedAt = new Date().toISOString();
      await store.upsert(editor.document.uri, target);
      await refresh(editor.document.uri);
    })
  );
}

function resolveResourceUri(resource?: string | vscode.Uri): vscode.Uri | undefined {
  if (resource instanceof vscode.Uri) {
    return resource;
  }
  if (typeof resource === "string" && resource) {
    try {
      return vscode.Uri.parse(resource);
    } catch {
      return undefined;
    }
  }
  return vscode.window.activeTextEditor?.document.uri;
}

async function createFromEditor(
  store: AnnotationStore,
  type: Annotation["type"],
  extra?: { comment?: string; url?: string }
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "markdown") {
    void vscode.window.showInformationMessage("Open a Markdown file and select text to annotate.");
    return;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showInformationMessage("Select text to annotate.");
    return;
  }
  const enabled = vscode.workspace.getConfiguration("annotateMd").get<boolean>("enabled", true);
  if (!enabled) {
    return;
  }
  const source = editor.document.getText();
  const start = editor.document.offsetAt(editor.selection.start);
  const end = editor.document.offsetAt(editor.selection.end);
  const cfg = vscode.workspace.getConfiguration("annotateMd");
  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: uuid(),
    type,
    color: cfg.get<ColorName>("defaultColor") || "yellow",
    comment: extra?.comment,
    url: extra?.url,
    createdAt: now,
    updatedAt: now,
    author: cfg.get<string>("author") || undefined,
    anchor: createAnchor(source, start, end, offsetToLine(source, start)),
    status: "active",
  };
  await store.upsert(editor.document.uri, annotation);
  await vscode.commands.executeCommand("markdown.preview.refresh");
}

async function pickColor(): Promise<ColorName | undefined> {
  const picked = await vscode.window.showQuickPick([...COLORS], { placeHolder: "Highlight color" });
  return picked as ColorName | undefined;
}

async function pickAnnotation(anns: Annotation[]): Promise<Annotation | undefined> {
  if (!anns.length) {
    void vscode.window.showInformationMessage("No annotations on this document.");
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    anns.map((a) => ({
      label: a.anchor.exact.slice(0, 80) || a.id,
      description: `${a.type} · ${a.color}${a.status === "orphaned" ? " · orphaned" : ""}`,
      a,
    }))
  );
  return picked?.a;
}
