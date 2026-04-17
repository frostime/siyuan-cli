import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/getHPathByPath",
  summary: "Get human-readable path by path",
  payload: {
    type: "object",
    required: ["notebook", "path"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "Notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      path: { type: "string", description: "Document path" },
    },
  },
  tags: ["read"],
  guard: { payload: { notebook: "notebook" } },
};
