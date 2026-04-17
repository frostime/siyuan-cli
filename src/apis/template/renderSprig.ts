import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/template/renderSprig",
  summary: "Render Sprig template",
  payload: {
    type: "object",
    required: ["template"],
    additionalProperties: false,
    properties: {
      template: { type: "string", description: "Sprig template string" },
    },
  },
  tags: ["read"],
  cli: {
    primary: "template",
    allowSource: { template: ["literal", "file", "stdin"] },
  },
};
