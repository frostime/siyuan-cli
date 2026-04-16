import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/deleteBlock",
  summary: "删除块",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["write", "mutation", "dangerous"],
  guard: { payload: { id: "id" } },
};
