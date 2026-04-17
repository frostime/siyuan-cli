import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/convert/pandoc",
  summary: "Convert content using Pandoc",
  payload: {
    type: "object",
    required: ["content", "from", "to"],
    additionalProperties: false,
    properties: {
      content: { type: "string", description: "Content to convert" },
      from: { type: "string", description: "Source format" },
      to: { type: "string", description: "Target format" },
      args: { type: "string", description: "Additional Pandoc arguments" },
    },
  },
  tags: ["read"],
  cli: {
    primary: "content",
    allowSource: { content: ["literal", "file", "stdin"] },
  },
};
