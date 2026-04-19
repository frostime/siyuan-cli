import type { EndpointSchema } from "../../core/schema.js";
export const schema: EndpointSchema = {
  endpoint: "/api/system/bootProgress",
  summary: "Get SiYuan boot progress (commonly used in Docker scenarios)",
  payload: { type: "object", properties: {} },
  classification: {
    mode: "read",
    surface: "meta",
    scope: "single",
    operation: "inspect",
  },
};
