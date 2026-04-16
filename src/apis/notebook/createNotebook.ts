import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/notebook/createNotebook",
  summary: "创建新笔记本",
  payload: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: {
      name: { type: "string", description: "笔记本名称" },
    },
  },
  tags: ["write", "mutation"],
  cli: {
    primary: "name",
    allowSource: { name: ["literal"] },
  },
};
