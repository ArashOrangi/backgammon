import { Hono } from "hono";
import { prismaUserCreate } from "@/models/user";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";
import { OrmState } from "@/models/enums";

export const userRoutes = new Hono();

userRoutes.post("/", async (c) => {
  const { userName } = await c.req.json();
  if (!userName) {
    return onErrorRestResponse({ ctx: c, errorMessage: "userName required" });
  }
  const result = await prismaUserCreate(userName);
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to create user",
    });
  }
  return onOkRestResponse({ ctx: c, data: result });
});
