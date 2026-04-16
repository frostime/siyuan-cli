import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/getBlockKramdown",
  summary: "获取块的 Kramdown 内容",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["read"],
  guard: { payload: { id: "id" } },
};
