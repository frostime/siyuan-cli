import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/filetree/createDailyNote",
  summary: "Create or get today's daily note for a notebook",
  payload: {
    type: "object",
    required: ["notebook"],
    additionalProperties: false,
    properties: {
      notebook: { type: "string", description: "Notebook ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      app: { type: "string", description: "Optional app id" },
    },
  },
  tags: ["write", "mutation"],
  guard: { payload: { notebook: "notebook" } },
};
