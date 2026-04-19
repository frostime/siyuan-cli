import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/sqlite/flushTransaction",
  summary: "Flush SQLite transaction",
  payload: { type: "object", properties: {} },
  classification: {
    mode: "invoke",
    surface: "runtime",
    scope: "single",
    operation: "control",
  },
};
