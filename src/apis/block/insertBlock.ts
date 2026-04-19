import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/insertBlock",
  summary: "Insert blocks before, after, or as child of specified block",
  payload: {
    type: "object",
    additionalProperties: false,
    properties: {
      dataType: { type: "string", enum: ["markdown", "dom"], default: "markdown", description: "Content type" },
      data: { type: "string", description: "Content to insert" },
      nextID: { type: "string", description: "Next block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      previousID: { type: "string", description: "Previous block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
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
      { path: "nextID", kind: "id", access: "write" },
      { path: "previousID", kind: "id", access: "write" },
      { path: "parentID", kind: "id", access: "write" },
    ],
  },
};
