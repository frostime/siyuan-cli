import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/appendBlock",
  summary: "在父块末尾追加内容",
  payload: {
    type: "object",
    required: ["dataType", "data", "parentID"],
    additionalProperties: false,
    properties: {
      dataType: { type: "string", enum: ["markdown", "dom"], default: "markdown", description: "内容类型" },
      data: { type: "string", description: "要追加的内容" },
      parentID: { type: "string", description: "父块/文档 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["write", "mutation"],
  cli: { allowSource: { data: ["literal", "file", "stdin"] } },
  guard: { payload: { parentID: "id" } },
};
