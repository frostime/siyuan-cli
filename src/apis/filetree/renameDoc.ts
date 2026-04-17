import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/renameDoc",
  summary: "Rename document",
  payload: {
    type: "object",
    required: ["notebook", "path", "title"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "笔记本 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      path: { type: "string", description: "文档 path" },
      title: { type: "string", description: "新标题" },
    },
  },
  tags: ["write", "mutation"],
  guard: {
    payload: { notebook: "notebook", path: "path" },
  },
};
