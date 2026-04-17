import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/export/exportResources",
  summary: "Export files and folders as ZIP",
  payload: {
    type: "object",
    required: ["paths"],
    additionalProperties: false,
    properties: {
      paths: { type: "array", description: "Resource paths to export", items: { type: "string" } },
      name: { type: "string", description: "Export file name" },
    },
  },
  tags: ["read"],
};
