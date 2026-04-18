import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/system/currentTime",
  summary: "Get current system time",
  payload: { type: "object", properties: {} },
  classification: {
    mode: "read",
    surface: "meta",
    scope: "single",
    operation: "inspect",
  },
};
