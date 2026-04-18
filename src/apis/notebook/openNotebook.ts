import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notebook/openNotebook",
  summary: "Open a notebook",
  payload: {
    type: "object",
    required: ["notebook"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "Notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "update",
  },
  guard: {
    payloadTargets: [
      { field: "notebook", kind: "notebook", access: "write" },
    ],
  },
};
