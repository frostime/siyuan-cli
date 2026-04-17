import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notebook/setNotebookConf",
  summary: "Set notebook configuration",
  payload: {
    type: "object",
    required: ["notebook", "conf"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "Notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      conf: {
        type: "object",
        description: "Notebook configuration object",
        additionalProperties: true,
        properties: {},
      },
    },
  },
  tags: ["write", "mutation"],
  guard: { payload: { notebook: "notebook" } },
};
