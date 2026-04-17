import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/system/logoutAuth",
  summary: "Logout authentication",
  payload: { type: "object", properties: {} },
  tags: ["write", "mutation"],
};
