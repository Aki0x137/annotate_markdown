# Markdown Annotator

Highlight, comment, color-code, and attach links in the **official VS Code Markdown preview**. The Markdown source is never modified. Annotations are stored next to the document in a sidecar file:

`README.md` → `README.md.annotations.json`

## Features

- Select text in the Markdown preview to show a toolbar: **Highlight**, color swatches, **Comment**, **Link**.
- Click an existing highlight in the preview to view, edit, or delete it.
- The same actions are available from the **Command Palette** (`Annotate: …`) and the Markdown editor context menu.
- Highlights also appear as decorations in the source editor.
- An **Annotations** view lists every annotation, including orphans after heavy edits.
- Re-attach an orphaned annotation by selecting the new text and running **Annotate: Re-attach Orphaned Annotation**.

## Commands

- `Annotate: Highlight Selection`
- `Annotate: Add Comment`
- `Annotate: Attach Link`
- `Annotate: Set Color`
- `Annotate: Edit Comment`
- `Annotate: Remove Annotation`
- `Annotate: Go to Annotation`
- `Annotate: Show Annotations`
- `Annotate: Re-attach Orphaned Annotation`

Default keybinding: `Ctrl+Alt+H` / `Cmd+Alt+H` highlights the current editor selection.

## Settings

- `annotateMd.defaultColor` — yellow, green, blue, pink, or orange
- `annotateMd.author` — optional name stored on new annotations
- `annotateMd.enabled` — turn the extension off for a workspace

## Sidecar format

Pretty-printed JSON, versioned, git-friendly. Each annotation stores a text-quote selector (`exact`, `prefix`, `suffix`, `lineHint`) rather than offsets.

## Privacy

The extension does not collect telemetry. All data stays in your workspace sidecar files.

## Restricted Mode

In untrusted workspaces, existing highlights still render. Creating or editing annotations requires a trusted workspace.
