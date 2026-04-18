import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/searchDocs",
  summary: "Search documents",
  payload: {
    type: "object",
    required: ["k"],
    additionalProperties: false,
    properties: {
      k: { type: "string", description: "Search keyword" },
      notebook: { type: "string", description: "Notebook ID to search in", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      path: { type: "string", description: "Path to search under" },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "batch",
    operation: "search",
  },
  cli: { primary: "k" },
  guard: {
    payloadTargets: [
      { field: "notebook", kind: "notebook", access: "read" },
      { field: "path", kind: "path", access: "read" },
    ],
    filterResponse: (response, engine) => {
      const rows = Array.isArray(response) ? response : [];
      return engine.filterItems(rows, (row) => {
        const r = row as Record<string, unknown>;
        return {
          path: typeof r.path === "string" ? r.path : undefined,
          notebook: typeof r.box === "string" ? r.box : undefined,
        };
      }).kept;
    },
  },
};
