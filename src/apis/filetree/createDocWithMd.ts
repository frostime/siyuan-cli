import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/createDocWithMd",
  summary: "Create Markdown document",
  payload: {
    type: "object",
    required: ["notebook", "path", "markdown"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "Notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      path: { type: "string", description: "Target SiYuan path" },
      markdown: { type: "string", description: "Markdown content" },
    },
  },
  tags: ["write", "mutation"],
  cli: {
    allowSource: { markdown: ["literal", "file", "stdin"] },
  },
  guard: {
    payload: { notebook: "notebook", path: "path" },
  },
};
