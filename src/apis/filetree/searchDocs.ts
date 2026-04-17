import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/searchDocs",
  summary: "Search documents",
  payload: {
    type: "object",
    required: ["k"],
    additionalProperties: false,
    properties: {
      k: { type: "string", description: "Search keyword" },
      notebook: { type: "string", description: "Notebook ID to search in", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      path: { type: "string", description: "Path to search under" },
    },
  },
  tags: ["read"],
  cli: { primary: "k" },
};
