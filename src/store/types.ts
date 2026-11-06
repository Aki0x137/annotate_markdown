export const SCHEMA_VERSION = 1;

export const COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;
export type ColorName = (typeof COLORS)[number];

export type AnnotationType = "highlight" | "comment" | "link";
export type AnnotationStatus = "active" | "orphaned";

export interface TextQuoteAnchor {
  exact: string;
  prefix: string;
  suffix: string;
  lineHint?: number;
  blockIndex?: number;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  color: ColorName;
  comment?: string;
  url?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  author?: string;
  anchor: TextQuoteAnchor;
  status: AnnotationStatus;
}

export interface AnnotationFile {
  version: number;
  document: string;
  annotations: Annotation[];
}

export function emptyFile(document: string): AnnotationFile {
  return { version: SCHEMA_VERSION, document, annotations: [] };
}

export function sidecarUriFor(markdownPath: string): string {
  return `${markdownPath}.annotations.json`;
}
