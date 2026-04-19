import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/asset/upload",
  summary: "Upload assets",
  payload: {
    type: "object",
    required: ["file[]"],
    additionalProperties: false,
    properties: {
      "file[]": {
        type: "array",
        description: "Local file paths to upload (multiple allowed)",
        items: { type: "string" },
      },
      assetsDirPath: {
        type: "string",
        description: "Asset save directory",
        default: "/assets/",
      },
    },
  },
  multipart: { fileFields: ["file[]"] },
  classification: {
    mode: "write",
    surface: "asset",
    scope: "single",
    operation: "upload",
  },
};
