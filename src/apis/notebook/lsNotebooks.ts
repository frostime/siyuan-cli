import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notebook/lsNotebooks",
  summary: "List all notebooks",
  payload: {
    type: "object",
    additionalProperties: false,
    properties: {
      flashcard: { type: "boolean", description: "Include flashcard-related information", default: false },
    },
  },
  tags: ["read"],
  guard: {
    response: {
      itemsAt: "data.notebooks[*]",
      fieldMap: { notebook: "id" },
    },
  },
};
