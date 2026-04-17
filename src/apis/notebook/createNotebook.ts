import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notebook/createNotebook",
  summary: "Create a new notebook",
  payload: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: {
      name: { type: "string", description: "Notebook name" },
    },
  },
  tags: ["write", "mutation"],
  cli: {
    primary: "name",
    allowSource: { name: ["literal"] },
  },
};
