import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/file/removeFile",
  summary: "Remove file under workspace directory",
  payload: {
    type: "object",
    required: ["path"],
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "File path under workspace" },
    },
  },
  tags: ["write", "mutation"],
};
