import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/export/exportMdContent",
  summary: "导出文档 Markdown 内容",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "文档 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["read"],
  guard: { payload: { id: "id" } },
};
