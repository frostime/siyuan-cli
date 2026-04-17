import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/file/renameFile",
  summary: "Rename file under workspace directory",
  payload: {
    type: "object",
    required: ["path", "newPath"],
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "Current file path" },
      newPath: { type: "string", description: "New file path" },
    },
  },
  tags: ["write", "mutation"],
};
