import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notebook/lsNotebooks",
  summary: "列出所有笔记本",
  payload: {
    type: "object",
    additionalProperties: false,
    properties: {
      flashcard: { type: "boolean", description: "是否包含闪卡相关信息", default: false },
    },
  },
  tags: ["read"],
  guard: {
    response: {
      itemsAt: "data.notebooks[*]",
      fieldMap: { notebook: "id" },
    },
  },
};
