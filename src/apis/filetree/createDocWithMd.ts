import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/createDocWithMd",
  summary: "创建 Markdown 文档",
  payload: {
    type: "object",
    required: ["notebook", "path", "markdown"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "笔记本 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      path: { type: "string", description: "目标思源 path" },
      markdown: { type: "string", description: "Markdown 内容" },
    },
  },
  tags: ["write", "mutation"],
  cli: {
    allowSource: { markdown: ["literal", "file", "stdin"] },
  },
  guard: {
    payload: { notebook: "notebook", path: "path" },
  },
};
