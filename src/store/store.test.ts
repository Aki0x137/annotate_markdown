import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyFile, SCHEMA_VERSION } from "./types";

describe("annotation file", () => {
  it("creates an empty sidecar document", () => {
    const file = emptyFile("README.md");
    assert.equal(file.version, SCHEMA_VERSION);
    assert.equal(file.document, "README.md");
    assert.equal(file.annotations.length, 0);
  });
});
