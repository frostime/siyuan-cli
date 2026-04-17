import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/removeDoc",
  summary: "Remove document",
  payload: {
    type: "object",
    required: ["notebook", "path"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "笔记本 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      path: { type: "string", description: "文档 path" },
    },
  },
  tags: ["write", "mutation", "dangerous"],
  guard: {
    payload: { notebook: "notebook", path: "path" },
  },
};
