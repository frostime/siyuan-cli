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
  classification: {
    mode: "write",
    surface: "workspace",
    scope: "single",
    operation: "delete",
  },
  guard: {
    payloadTargets: [
      { field: "path", kind: "workspace-path", access: "write" },
    ],
  },
};
