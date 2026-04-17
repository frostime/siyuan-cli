import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/moveDocsByID",
  summary: "Move documents by ID",
  payload: {
    type: "object",
    required: ["fromIDs", "toID"],
    additionalProperties: false,
    properties: {
      fromIDs: { type: "array", description: "Source document IDs", items: { type: "string", pattern: "^\\d{14}-[0-9a-z]{7}$" } },
      toID: { type: "string", description: "Target document ID or notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  tags: ["write", "mutation"],
};
