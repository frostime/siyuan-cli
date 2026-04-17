import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/file/readDir",
  summary: "List files in directory",
  payload: {
    type: "object",
    required: ["path"],
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "Directory path under workspace" },
    },
  },
  tags: ["read"],
};
