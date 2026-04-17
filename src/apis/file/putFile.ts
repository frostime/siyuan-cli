import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/file/putFile",
  summary: "Put file under workspace directory",
  payload: {
    type: "object",
    required: ["path", "file"],
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "File path under workspace" },
      file: { type: "string", description: "Base64 encoded file content or file path" },
      isDir: { type: "boolean", description: "Whether the path is a directory", default: false },
      modTime: { type: "integer", description: "File modification timestamp" },
    },
  },
  tags: ["write", "mutation"],
};
