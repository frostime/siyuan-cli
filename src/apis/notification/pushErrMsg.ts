import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notification/pushErrMsg",
  summary: "Push error message to SiYuan interface",
  payload: {
    type: "object",
    required: ["msg"],
    additionalProperties: false,
    properties: {
      msg: { type: "string", description: "Error message content" },
      timeout: { type: "integer", description: "Display duration (milliseconds)" },
    },
  },
  tags: ["write"],
  cli: {
    primary: "msg",
    allowSource: { msg: ["literal", "file", "stdin"] },
  },
};
