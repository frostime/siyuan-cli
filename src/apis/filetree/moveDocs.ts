import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/moveDocs",
  summary: "Move documents by path",
  payload: {
    type: "object",
    required: ["fromPaths", "toNotebook", "toPath"],
    additionalProperties: false,
    properties: {
      fromPaths: { type: "array", description: "Source document paths", items: { type: "string" } },
      toNotebook: { type: "string", description: "Target notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      toPath: { type: "string", description: "Target path" },
    },
  },
  tags: ["write", "mutation"],
};
