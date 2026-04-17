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
  tags: ["write", "mutation"],
  // #TODO 检查确认，当前的安全机制是否支持同时验证多个字段为ID类型？
  guard: { payload: { id: "id", previousID: "id", parentID: "id" } },
};
