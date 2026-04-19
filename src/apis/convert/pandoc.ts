import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/convert/pandoc",
  summary: "Execute pandoc to convert content",
  payload: {
    type: "object",
    required: ["args"],
    additionalProperties: false,
    properties: {
      // args is the full pandoc command-line parameter list passed directly to the pandoc binary.
      // The kernel constrains the working directory to workspace/temp/convert/pandoc/:dir,
      // so local file access outside the workspace sandbox is not possible via this API.
      args: { type: "array", description: "Pandoc command-line parameter list", items: { type: "string" } },
      dir: { type: "string", description: "Working dir name under workspace/temp/convert/pandoc/; random if unset" },
    },
  },
  classification: {
    mode: "read",
    surface: "meta",
    scope: "single",
    operation: "inspect",
  },
};
