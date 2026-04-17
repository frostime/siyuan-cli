import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/template/render",
  summary: "Render a template",
  payload: {
    type: "object",
    required: ["path"],
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "Template file path" },
    },
  },
  tags: ["read"],
};
