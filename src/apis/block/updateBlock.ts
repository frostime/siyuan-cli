import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/updateBlock",
  summary: "更新块内容",
  payload: {
    type: "object",
    required: ["dataType", "data", "id"],
    additionalProperties: false,
    properties: {
      dataType: { type: "string", enum: ["markdown", "dom"], default: "markdown", description: "内容类型" },
      data: { type: "string", description: "新内容" },
      id: { type: "string", description: "块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["write", "mutation"],
  cli: { allowSource: { data: ["literal", "file", "stdin"] } },
  guard: { payload: { id: "id" } },
};
