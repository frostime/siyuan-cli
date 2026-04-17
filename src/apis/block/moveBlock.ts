/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-04-17 22:13:50
 * @Description  :
 * @FilePath     : /src/apis/block/moveBlock.ts
 * @LastEditTime : 2026-04-17 22:15:54
 */
import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/moveBlock",
  summary: "Move a block",
  payload: {
    type: "object",
    required: ["id", "previousID", "parentID"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "Block ID to move", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      previousID: { type: "string", description: "Previous block ID (empty if moving to first position)", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      parentID: { type: "string", description: "Parent block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "move",
  },
  guard: {
    payloadTargets: [
      { field: "id", kind: "id", access: "write" },
      { field: "parentID", kind: "id", access: "write" },
      { field: "previousID", kind: "id", access: "write" },
    ],
  },
};
