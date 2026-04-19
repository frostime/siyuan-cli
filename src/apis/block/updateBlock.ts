import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/updateBlock",
  summary: "Update block content",
  payload: {
    type: "object",
    required: ["dataType", "data", "id"],
    additionalProperties: false,
    properties: {
      dataType: { type: "string", enum: ["markdown", "dom"], default: "markdown", description: "Content type" },
      data: { type: "string", description: "New content" },
      id: { type: "string", description: "Block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "update",
  },
  cli: { allowSource: { data: ["literal", "file", "stdin"] } },
  guard: {
    payloadTargets: [
      { path: "id", kind: "id", access: "write" },
    ],
  },
};
