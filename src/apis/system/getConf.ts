import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/system/getConf",
  summary: "Get system configuration",
  payload: { type: "object", properties: {} },
  classification: {
    mode: "read",
    surface: "meta",
    scope: "single",
    operation: "inspect",
    // Returns full system configuration; more sensitive than ordinary meta reads.
    riskOverride: "sensitive",
  },
};
