import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/system/getConf",
  summary: "Get system configuration",
  payload: { type: "object", properties: {} },
  tags: ["read"],
};
