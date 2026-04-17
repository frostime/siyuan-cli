import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/file/getFile",
  summary: "Get file under workspace directory",
  payload: {
    type: "object",
    required: ["path"],
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "File path under workspace" },
    },
  },
  tags: ["read"],
};
