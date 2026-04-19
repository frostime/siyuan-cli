import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/deleteBlock",
  summary: "Delete block",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "delete",
  },
  guard: {
    payloadTargets: [
      { path: "id", kind: "id", access: "write" },
    ],
  },
};
