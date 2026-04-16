import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/search/fullTextSearchBlock",
  summary: "全文检索块",
  payload: {
    type: "object",
    additionalProperties: false,
    properties: {
      method: { type: "integer", description: "搜索方法" },
      groupBy: { type: "integer", description: "分组方式" },
      orderBy: { type: "integer", description: "排序方式" },
      page: { type: "integer", description: "页码" },
      pageSize: { type: "integer", description: "每页数量" },
      paths: { type: "array", description: "路径过滤", items: { type: "string" } },
      query: { type: "string", description: "搜索关键字" },
      types: { type: "object", description: "块类型过滤", properties: {}, additionalProperties: true },
    },
  },
  tags: ["read"],
  cli: { primary: "query" },
  guard: {
    response: {
      itemsAt: "data.blocks[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
