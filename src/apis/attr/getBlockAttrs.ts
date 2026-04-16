import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/attr/getBlockAttrs",
  summary: "获取块属性",
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
