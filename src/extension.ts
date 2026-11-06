import * as vscode from "vscode";
import type MarkdownIt from "markdown-it";
import { AnnotationStore } from "./store/annotationStore";
import { annotatePlugin } from "./markdown/plugin";
import { registerCommands } from "./commands/register";
import { AnnotationsTreeProvider } from "./editor/treeView";
import { AnnotationDecorations } from "./editor/decorations";

async function preload(store: AnnotationStore, uri: vscode.Uri | undefined): Promise<void> {
  if (!uri || !uri.path.endsWith(".md")) {
    return;
  }
  await store.get(uri);
}

export function activate(context: vscode.ExtensionContext) {
  const store = new AnnotationStore();
  const tree = new AnnotationsTreeProvider(store);
  const decorations = new AnnotationDecorations(store);

  context.subscriptions.push(
    store,
    decorations,
    vscode.window.registerTreeDataProvider("annotateMd.annotations", tree)
  );

  registerCommands(context, store, tree, decorations);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void preload(store, editor?.document.uri);
      tree.refresh();
      void decorations.refresh();
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      void preload(store, doc.uri);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === "markdown") {
        void store.recomputeStatuses(e.document.uri, e.document.getText());
        void decorations.refresh(e.document.uri);
      }
    }),
    store.onDidChange((uri) => {
      tree.refresh();
      void decorations.refresh(uri);
      void vscode.commands.executeCommand("markdown.preview.refresh");
    })
  );

  void preload(store, vscode.window.activeTextEditor?.document.uri);
  void decorations.refresh();

  return {
    extendMarkdownIt(md: MarkdownIt) {
      return annotatePlugin(md, (uri) => {
        if (!vscode.workspace.getConfiguration("annotateMd").get<boolean>("enabled", true)) {
          return [];
        }
        if (!uri) {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            return [];
          }
          return store.cachePeek(editor.document.uri);
        }
        try {
          const parsed = vscode.Uri.parse(uri);
          return store.cachePeek(parsed);
        } catch {
          return [];
        }
      });
    },
  };
}

export function deactivate() {}
