import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/getHPathByID",
  summary: "根据文档/块 ID 获取 hpath",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "文档或块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["read"],
  guard: {
    payload: { id: "id" },
  },
};
