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
  tags: ["read", "query"],
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
    response: {
      itemsAt: "data[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
