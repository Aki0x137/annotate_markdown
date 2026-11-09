# Changelog

## 0.1.4

- Show comments in the Markdown preview beside highlights, with basic formatting (`code`, **bold**, *italic*).
- Popover layout: comment on its own row; color / edit / delete actions below.
- Preview **Edit** for comments from the highlight popover.

## 0.1.3

- Fix Markdown preview going blank: toolbar actions use real `vscode://` links instead of a programmatic click that navigated the webview away.

## 0.1.2

- Rename Marketplace display name to **Annotate Markdown Preview** (the previous name was already taken).

## 0.1.1

- Pin `@vscode/vsce@4.1.0` in the publish workflow so `--oidc` is available.

## 0.1.0

- Initial release: preview toolbar, command palette, sidecar annotations, editor decorations, annotations tree view.
