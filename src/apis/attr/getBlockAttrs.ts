import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/attr/getBlockAttrs",
  summary: "Get block attributes",
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
      { path: "id", kind: "id", access: "read" },
    ],
  },
};
