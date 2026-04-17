import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/query/sql",
  summary: "Query SiYuan database via SQL",
  description: "Execute SQL `select` queries. The CLI permission layer filters results by path/notebook by default.",
  payload: {
    type: "object",
    required: ["stmt"],
    additionalProperties: false,
    properties: {
      stmt: { type: "string", description: "SQL query statement" },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "global",
    operation: "query",
  },
  cli: {
    primary: "stmt",
    aliases: { stmt: "s" },
    allowSource: {
      stmt: ["literal", "file", "stdin"],
    },
    examples: [
      { command: 'siyuan api query.sql "SELECT id FROM blocks LIMIT 5"' },
      { command: "siyuan api query.sql --stmt @file:./query.sql" },
      { command: "cat query.sql | siyuan api query.sql --stmt @stdin" },
    ],
  },
  guard: {
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
