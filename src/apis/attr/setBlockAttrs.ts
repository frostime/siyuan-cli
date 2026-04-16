import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/attr/setBlockAttrs",
  summary: "设置块属性",
  payload: {
    type: "object",
    required: ["id", "attrs"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      attrs: {
        type: "object",
        description: "属性键值对",
        additionalProperties: true,
        properties: {},
      },
    },
  },
  tags: ["write", "mutation"],
  guard: { payload: { id: "id" } },
};
