import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notebook/closeNotebook",
  summary: "Close a notebook",
  payload: {
    type: "object",
    required: ["notebook"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "Notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["write", "mutation"],
  guard: { payload: { notebook: "notebook" } },
};
