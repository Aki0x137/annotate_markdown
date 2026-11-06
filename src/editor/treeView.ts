import * as vscode from "vscode";
import { AnnotationStore } from "../store/annotationStore";
import { Annotation } from "../store/types";

export class AnnotationItem extends vscode.TreeItem {
  constructor(
    public readonly annotation: Annotation,
    public readonly resource: vscode.Uri
  ) {
    super(annotation.anchor.exact.slice(0, 60) || annotation.id, vscode.TreeItemCollapsibleState.None);
    this.description = `${annotation.type} · ${annotation.color}${annotation.status === "orphaned" ? " · orphaned" : ""}`;
    this.tooltip = annotation.comment || annotation.url || annotation.anchor.exact;
    this.contextValue = annotation.status;
    this.command = {
      command: "annotateMd.goToAnnotation",
      title: "Go to annotation",
      arguments: [{ id: annotation.id, resource }],
    };
  }
}

export class AnnotationsTreeProvider implements vscode.TreeDataProvider<AnnotationItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly store: AnnotationStore) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: AnnotationItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<AnnotationItem[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "markdown") {
      return [];
    }
    const anns = await this.store.list(editor.document.uri);
    return anns.map((a) => new AnnotationItem(a, editor.document.uri));
  }
}
