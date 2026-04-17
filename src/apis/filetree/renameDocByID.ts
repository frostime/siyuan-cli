import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/renameDocByID",
  summary: "Rename document by ID",
  payload: {
    type: "object",
    required: ["id", "title"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "Document ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      title: { type: "string", description: "New document title" },
    },
  },
  tags: ["write", "mutation"],
  guard: { payload: { id: "id" } },
};
