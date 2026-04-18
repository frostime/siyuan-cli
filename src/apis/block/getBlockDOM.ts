import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/getBlockDOM",
  summary: "Get block DOM content",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "Block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "single",
    operation: "inspect",
  },
  guard: {
    payloadTargets: [
      { field: "id", kind: "id", access: "read" },
    ],
  },
};
