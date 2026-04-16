import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/getChildBlocks",
  summary: "获取子块列表",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "父块 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["read"],
  guard: {
    payload: { id: "id" },
    response: {
      itemsAt: "data[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
