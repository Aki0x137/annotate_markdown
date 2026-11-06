import * as vscode from "vscode";
import { AnnotationStore } from "../store/annotationStore";
import { ColorName } from "../store/types";
import { resolveAnchor } from "../anchoring/anchor";

const COLORS: Record<ColorName, string> = {
  yellow: "rgba(255, 235, 59, 0.35)",
  green: "rgba(129, 199, 132, 0.35)",
  blue: "rgba(100, 181, 246, 0.35)",
  pink: "rgba(244, 143, 177, 0.35)",
  orange: "rgba(255, 183, 77, 0.35)",
};

export class AnnotationDecorations implements vscode.Disposable {
  private types = new Map<ColorName, vscode.TextEditorDecorationType>();

  constructor(private readonly store: AnnotationStore) {
    for (const [name, color] of Object.entries(COLORS) as [ColorName, string][]) {
      this.types.set(
        name,
        vscode.window.createTextEditorDecorationType({
          backgroundColor: color,
          borderRadius: "2px",
        })
      );
    }
  }

  async refresh(uri?: vscode.Uri): Promise<void> {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId !== "markdown") {
        continue;
      }
      if (uri && editor.document.uri.toString() !== uri.toString()) {
        continue;
      }
      await this.apply(editor);
    }
  }

  private async apply(editor: vscode.TextEditor): Promise<void> {
    const anns = await this.store.list(editor.document.uri);
    const source = editor.document.getText();
    const byColor = new Map<ColorName, vscode.DecorationOptions[]>();
    for (const name of this.types.keys()) {
      byColor.set(name, []);
    }
    for (const a of anns) {
      const hit = resolveAnchor(source, a.anchor);
      if (!hit) {
        continue;
      }
      const range = new vscode.Range(editor.document.positionAt(hit.start), editor.document.positionAt(hit.end));
      byColor.get(a.color)?.push({
        range,
        hoverMessage: [a.comment, a.url].filter(Boolean).join("\n") || a.type,
      });
    }
    for (const [name, type] of this.types) {
      editor.setDecorations(type, byColor.get(name) ?? []);
    }
  }

  dispose(): void {
    for (const t of this.types.values()) {
      t.dispose();
    }
  }
}
