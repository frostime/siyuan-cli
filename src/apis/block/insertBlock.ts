import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/insertBlock",
  summary: "在指定块前后或子级插入内容",
  payload: {
    type: "object",
    additionalProperties: false,
    properties: {
      dataType: { type: "string", enum: ["markdown", "dom"], default: "markdown", description: "内容类型" },
      data: { type: "string", description: "要插入的内容" },
      nextID: { type: "string", description: "后一个块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      previousID: { type: "string", description: "前一个块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      parentID: { type: "string", description: "父块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["write", "mutation"],
  cli: { allowSource: { data: ["literal", "file", "stdin"] } },
};
