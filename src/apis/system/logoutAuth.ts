import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/system/logoutAuth",
  summary: "Logout authentication",
  payload: { type: "object", properties: {} },
  classification: {
    mode: "invoke",
    surface: "runtime",
    scope: "single",
    operation: "control",
    // Invalidates the current session but does not destroy workspace/content data.
    riskOverride: "sensitive",
  },
};
