import type { EndpointSchema } from "../../core/schema.js";
export const schema: EndpointSchema = {
  endpoint: "/api/system/bootProgress",
  summary: "获取思源启动进度（Docker 场景常用）",
  payload: { type: "object", properties: {} },
  tags: ["read"],
};
