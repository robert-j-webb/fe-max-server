import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { execa } from "execa";

import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { commonValidations } from "@/common/utils/commonValidation";
import { validateRequest } from "@/common/utils/httpHandlers";
import { maxServeService } from "./maxServeService";

export const maxRegistry = new OpenAPIRegistry();
export const maxRouter: Router = express.Router();

maxRegistry.registerPath({
  method: "get",
  path: "/max/version",
  tags: ["MAX"],
  responses: createApiResponse(z.null(), "Success"),
});

maxRouter.get("/version", async (_req: Request, res: Response) => {
  const response = await execa`max --version`;
  const isMaxFound = response.exitCode === 0;
  res.status(isMaxFound ? 200 : 404).send(response.stdout);
});

const getMaxServeSchema = z.object({
  modelName: commonValidations.validFlag.openapi({
    example: "meta-llama/Llama-3.2-1B-Instruct",
  }),
  weightsPath: commonValidations.validFlag.optional().openapi({
    example:
      "bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q6_K.gguf",
  }),
  trustRemoteCodeFlag: commonValidations.validFlag.optional().openapi({
    example: "true",
  }),
});

maxRegistry.registerPath({
  method: "post",
  path: "/max/serve",
  tags: ["MAX"],
  request: {
    body: {
      content: { "application/json": { schema: getMaxServeSchema } },
      required: true,
    },
  },
  responses: createApiResponse(z.null(), "Success"),
});

maxRouter.post(
  "/serve",
  validateRequest(z.object({ body: getMaxServeSchema })),
  async (_req: Request, res: Response) => {
    await maxServeService.start(_req.body.modelName, {
      weightsPath: _req.body.weightsPath,
      trustRemoteCodeFlag: Boolean(_req.body.trustRemoteCodeFlag),
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const status = maxServeService.getStatus();
    res.status(status.error ? 500 : 200).send(status);
  }
);

maxRegistry.registerPath({
  method: "get",
  path: "/max/stdout",
  tags: ["MAX"],
  responses: createApiResponse(z.null(), "Success"),
});

maxRouter.get("/stdout", async (_req: Request, res: Response) => {
  res.status(200).send(maxServeService.getStdout());
});

maxRegistry.registerPath({
  method: "get",
  path: "/max/status",
  tags: ["MAX"],
  responses: createApiResponse(z.null(), "Success"),
});

maxRouter.get("/status", async (_req: Request, res: Response) => {
  res.status(200).send(maxServeService.getStatus());
});
