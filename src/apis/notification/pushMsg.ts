import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notification/pushMsg",
  summary: "推送消息到思源界面",
  payload: {
    type: "object",
    required: ["msg"],
    additionalProperties: false,
    properties: {
      msg: { type: "string", description: "消息内容" },
      timeout: { type: "integer", description: "显示时长（毫秒）" },
    },
  },
  tags: ["write"],
  cli: {
    primary: "msg",
    allowSource: { msg: ["literal", "file", "stdin"] },
  },
};
