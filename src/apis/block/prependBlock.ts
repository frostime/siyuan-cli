import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/prependBlock",
  summary: "Prepend blocks to parent",
  payload: {
    type: "object",
    required: ["dataType", "data", "parentID"],
    additionalProperties: false,
    properties: {
      dataType: { type: "string", enum: ["markdown", "dom"], default: "markdown", description: "Content type" },
      data: { type: "string", description: "Content to prepend" },
      parentID: { type: "string", description: "Parent block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "create",
  },
  cli: { allowSource: { data: ["literal", "file", "stdin"] } },
  guard: {
    payloadTargets: [
      { field: "parentID", kind: "id", access: "write" },
    ],
  },
};
