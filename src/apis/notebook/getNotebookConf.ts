import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notebook/getNotebookConf",
  summary: "Get notebook configuration",
  payload: {
    type: "object",
    required: ["notebook"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "Notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "single",
    operation: "inspect",
  },
  guard: {
    payloadTargets: [
      { field: "notebook", kind: "notebook", access: "read" },
    ],
  },
};
