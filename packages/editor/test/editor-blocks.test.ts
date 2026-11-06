import { describe, expect, it } from "vitest";

import { createEditorSchema } from "../src/index.js";

describe("editor block schema", () => {
  it("assigns ProseMirror table roles to each table node", () => {
    const schema = createEditorSchema();

    expect(schema.nodes.table?.spec.tableRole).toBe("table");
    expect(schema.nodes.tableRow?.spec.tableRole).toBe("row");
    expect(schema.nodes.tableCell?.spec.tableRole).toBe("cell");
    expect(schema.nodes.tableHeader?.spec.tableRole).toBe("header_cell");
  });
});
