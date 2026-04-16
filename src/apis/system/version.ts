import type { EndpointSchema } from "../../core/schema.js";
export const schema: EndpointSchema = {
  endpoint: "/api/system/version",
  summary: "获取思源内核版本号",
  payload: { type: "object", properties: {} },
  tags: ["read"],
};
