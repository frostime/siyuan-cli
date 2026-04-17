import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/system/exit",
  summary: "Exit SiYuan kernel",
  payload: { type: "object", properties: {} },
  tags: ["write", "mutation"],
};
