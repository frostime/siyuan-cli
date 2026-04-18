import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/getChildBlocks",
  summary: "Get child block list",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "Parent block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "batch",
    operation: "inspect",
  },
  guard: {
    payloadTargets: [
      { field: "id", kind: "id", access: "read" },
    ],
    filterResponse: (response, engine) => {
      const rows = Array.isArray(response) ? response : [];
      const { kept, removed, reasons } = engine.filterItems(rows, (row) => {
        const r = row as Record<string, unknown>;
        return {
          id: typeof r.id === "string" ? r.id : undefined,
          path: typeof r.path === "string" ? r.path : undefined,
          notebook: typeof r.box === "string" ? r.box : undefined,
        };
      });
      if (removed > 0) {
        const summary = Object.entries(reasons).map(([r, n]) => `${n}x: ${r}`).join("; ");
        process.stderr.write(JSON.stringify({ warning: "CONTENT_FILTERED", removed, reasons: summary }) + "\n");
      }
      return kept;
    },
  },
};
