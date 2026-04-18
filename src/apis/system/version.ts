import type { EndpointSchema } from "../../core/schema.js";
export const schema: EndpointSchema = {
  endpoint: "/api/system/version",
  summary: "Get SiYuan kernel version",
  payload: { type: "object", properties: {} },
  classification: {
    mode: "read",
    surface: "meta",
    scope: "single",
    operation: "inspect",
  },
};
