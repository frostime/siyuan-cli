import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/sqlite/flushTransaction",
  summary: "Flush SQLite transaction",
  payload: { type: "object", properties: {} },
  tags: ["write", "mutation"],
};
