import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/query/sql",
  summary: "通过 SQL 查询思源数据库",
  description: "执行任意 SQL 查询。CLI 权限层默认将结果按 path/notebook 过滤。",
  payload: {
    type: "object",
    required: ["stmt"],
    additionalProperties: false,
    properties: {
      stmt: { type: "string", description: "SQL 查询语句" },
    },
  },
  tags: ["read", "query"],
  cli: {
    primary: "stmt",
    aliases: { stmt: "s" },
    allowSource: {
      stmt: ["literal", "file", "stdin"],
    },
    examples: [
      { command: 'siyuan api query.sql "SELECT id FROM blocks LIMIT 5"' },
      { command: "siyuan api query.sql --stmt @file:./query.sql" },
      { command: "cat query.sql | siyuan api query.sql --stmt @stdin" },
    ],
  },
  guard: {
    response: {
      itemsAt: "data[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
