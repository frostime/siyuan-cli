import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/getBlockKramdown",
  summary: "Get block Kramdown content",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
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
