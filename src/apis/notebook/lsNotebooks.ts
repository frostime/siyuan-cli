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
  classification: {
    mode: "read",
    surface: "content",
    scope: "global",
    operation: "inspect",
  },
  guard: {
    response: {
      itemsAt: "notebooks[*]",
      fieldMap: { notebook: "id" },
    },
  },
};
