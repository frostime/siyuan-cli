import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/search/fullTextSearchBlock",
  summary: "Full-text search blocks",
  payload: {
    type: "object",
    additionalProperties: false,
    properties: {
      method: { type: "integer", description: "Search method" },
      groupBy: { type: "integer", description: "Group by method" },
      orderBy: { type: "integer", description: "Order by method" },
      page: { type: "integer", description: "Page number" },
      pageSize: { type: "integer", description: "Items per page" },
      paths: { type: "array", description: "Path filter", items: { type: "string" } },
      query: { type: "string", description: "Search keyword" },
      types: { type: "object", description: "Block type filter", properties: {}, additionalProperties: true },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "global",
    operation: "search",
  },
  cli: { primary: "query" },
  guard: {
    response: {
      itemsAt: "blocks[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
