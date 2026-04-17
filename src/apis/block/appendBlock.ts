import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/appendBlock",
  summary: "Append blocks to parent",
  payload: {
    type: "object",
    required: ["dataType", "data", "parentID"],
    additionalProperties: false,
    properties: {
      dataType: { type: "string", enum: ["markdown", "dom"], default: "markdown", description: "Content type" },
      data: { type: "string", description: "Content to append" },
      parentID: { type: "string", description: "Parent block/document ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["write", "mutation"],
  cli: { allowSource: { data: ["literal", "file", "stdin"] } },
  guard: { payload: { parentID: "id" } },
};
