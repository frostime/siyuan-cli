import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/getIDsByHPath",
  summary: "Get document IDs by human-readable path",
  payload: {
    type: "object",
    required: ["notebook", "paths"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "Notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      paths: { type: "array", description: "Human-readable paths", items: { type: "string" } },
    },
  },
  tags: ["read"],
  guard: { payload: { notebook: "notebook" } },
};
