import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/system/exit",
  summary: "Exit SiYuan kernel",
  payload: { type: "object", properties: {} },
  classification: {
    mode: "invoke",
    surface: "runtime",
    scope: "single",
    operation: "control",
    riskOverride: "critical",
  },
};
