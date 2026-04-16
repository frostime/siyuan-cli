import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/listDocsByPath",
  summary: "列出指定路径下的文档",
  payload: {
    type: "object",
    required: ["notebook", "path"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "笔记本 ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      path: { type: "string", description: "思源 path（以 / 开头）" },
      sort: { type: "integer", description: "排序方式" },
      maxListCount: { type: "integer", description: "最大返回数量" },
      flashcard: { type: "boolean", description: "是否包含闪卡相关信息" },
    },
  },
  tags: ["read"],
  guard: {
    payload: { notebook: "notebook", path: "path" },
    filterResponse: (response, engine) => {
      const r = response as { files?: Array<Record<string, unknown>>; data?: { files?: Array<Record<string, unknown>>; box?: string } };
      const files = r.data?.files ?? r.files ?? [];
      const box = r.data?.box;
      const { kept } = engine.filterItems(files, (f) => ({
        id: typeof f.id === "string" ? f.id : undefined,
        path: typeof f.path === "string" ? f.path : undefined,
        notebook: typeof f.box === "string" ? f.box : box,
      }));
      if (r.data?.files) r.data.files = kept;
      else if (r.files) r.files = kept;
      return response;
    },
  },
};
