import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/getChildBlocks",
  summary: "Get child block list",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "Parent block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "batch",
    operation: "inspect",
  },
  guard: {
    payloadTargets: [
      { path: "id", kind: "id", access: "read" },
    ],
    response: {
      itemsAt: "[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
