import * as vscode from "vscode";
import {
  Annotation,
  AnnotationFile,
  emptyFile,
  SCHEMA_VERSION,
  sidecarUriFor,
} from "./types";
import { resolveAnchor } from "../anchoring/anchor";

export class AnnotationStore implements vscode.Disposable {
  private cache = new Map<string, AnnotationFile>();
  private watchers = new Map<string, vscode.FileSystemWatcher>();
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly fs: vscode.FileSystem = vscode.workspace.fs) {}

  sidecarFor(doc: vscode.Uri): vscode.Uri {
    return vscode.Uri.parse(sidecarUriFor(doc.toString())).with({
      scheme: doc.scheme,
      authority: doc.authority,
      path: `${doc.path}.annotations.json`,
      query: doc.query,
      fragment: doc.fragment,
    });
  }

  async get(doc: vscode.Uri): Promise<AnnotationFile> {
    const key = doc.toString();
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const file = await this.load(doc);
    this.cache.set(key, file);
    this.watch(doc);
    return file;
  }

  async list(doc: vscode.Uri): Promise<Annotation[]> {
    return (await this.get(doc)).annotations;
  }

  cachePeek(doc: vscode.Uri): Annotation[] {
    const file = this.cache.get(doc.toString());
    if (file) {
      return file.annotations;
    }
    void this.get(doc).then((loaded) => {
      if (loaded.annotations.length > 0) {
        this.onDidChangeEmitter.fire(doc);
      }
    });
    return [];
  }

  async upsert(doc: vscode.Uri, annotation: Annotation): Promise<void> {
    const file = await this.get(doc);
    const idx = file.annotations.findIndex((a) => a.id === annotation.id);
    if (idx >= 0) {
      file.annotations[idx] = annotation;
    } else {
      file.annotations.push(annotation);
    }
    await this.scheduleSave(doc, file);
  }

  async remove(doc: vscode.Uri, id: string): Promise<void> {
    const file = await this.get(doc);
    file.annotations = file.annotations.filter((a) => a.id !== id);
    await this.scheduleSave(doc, file);
  }

  async recomputeStatuses(doc: vscode.Uri, source: string): Promise<void> {
    const file = await this.get(doc);
    let changed = false;
    for (const a of file.annotations) {
      const hit = resolveAnchor(source, a.anchor);
      const next: typeof a.status = hit ? "active" : "orphaned";
      if (a.status !== next) {
        a.status = next;
        a.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) {
      await this.scheduleSave(doc, file);
    }
  }

  invalidate(doc: vscode.Uri): void {
    this.cache.delete(doc.toString());
  }

  dispose(): void {
    for (const t of this.saveTimers.values()) {
      clearTimeout(t);
    }
    for (const w of this.watchers.values()) {
      w.dispose();
    }
    this.onDidChangeEmitter.dispose();
  }

  private async load(doc: vscode.Uri): Promise<AnnotationFile> {
    const sidecar = this.sidecarFor(doc);
    try {
      const raw = await this.fs.readFile(sidecar);
      const text = new TextDecoder().decode(raw);
      const parsed = JSON.parse(text) as AnnotationFile;
      return migrate(parsed, basename(doc));
    } catch {
      return emptyFile(basename(doc));
    }
  }

  private async scheduleSave(doc: vscode.Uri, file: AnnotationFile): Promise<void> {
    this.cache.set(doc.toString(), file);
    const key = doc.toString();
    const existing = this.saveTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    await this.write(doc, file);
    this.onDidChangeEmitter.fire(doc);
  }

  private async write(doc: vscode.Uri, file: AnnotationFile): Promise<void> {
    const sidecar = this.sidecarFor(doc);
    const body = `${JSON.stringify(stable(file), null, 2)}\n`;
    await this.fs.writeFile(sidecar, new TextEncoder().encode(body));
  }

  private watch(doc: vscode.Uri): void {
    const key = doc.toString();
    if (this.watchers.has(key) || doc.scheme !== "file") {
      return;
    }
    const sidecar = this.sidecarFor(doc);
    const watcher = vscode.workspace.createFileSystemWatcher(sidecar.fsPath);
    watcher.onDidChange(async () => {
      this.cache.delete(key);
      await this.get(doc);
      this.onDidChangeEmitter.fire(doc);
    });
    watcher.onDidDelete(() => {
      this.cache.delete(key);
      this.onDidChangeEmitter.fire(doc);
    });
    this.watchers.set(key, watcher);
  }
}

function basename(doc: vscode.Uri): string {
  const parts = doc.path.split("/");
  return parts[parts.length - 1] ?? "document.md";
}

function migrate(parsed: AnnotationFile, document: string): AnnotationFile {
  const file: AnnotationFile = {
    version: SCHEMA_VERSION,
    document: parsed.document || document,
    annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
  };
  return file;
}

function stable(file: AnnotationFile): AnnotationFile {
  return {
    version: file.version,
    document: file.document,
    annotations: file.annotations.map((a) => ({
      id: a.id,
      type: a.type,
      color: a.color,
      comment: a.comment,
      url: a.url,
      tags: a.tags,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      author: a.author,
      anchor: {
        exact: a.anchor.exact,
        prefix: a.anchor.prefix,
        suffix: a.anchor.suffix,
        lineHint: a.anchor.lineHint,
        blockIndex: a.anchor.blockIndex,
      },
      status: a.status,
    })),
  };
}
