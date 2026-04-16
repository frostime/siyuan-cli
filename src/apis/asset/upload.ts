import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/asset/upload",
  summary: "上传资源文件",
  payload: {
    type: "object",
    required: ["file[]"],
    additionalProperties: false,
    properties: {
      "file[]": {
        type: "array",
        description: "要上传的本地文件路径（可多个）",
        items: { type: "string" },
      },
      assetsDirPath: {
        type: "string",
        description: "资源保存目录",
        default: "/assets/",
      },
    },
  },
  multipart: { fileFields: ["file[]"] },
  tags: ["write", "upload", "mutation"],
};
