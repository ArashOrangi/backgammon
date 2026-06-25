// middleware/middlewareAuth.ts
import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { keyUser } from "@/static/statics";
import { IMiddlewareAuth } from "@/models/middleware";
import { onErrorRestResponse } from "@/responses/response-builder";
import { messageError } from "@/static/messageError";
import { jwtVerifyUser, jwtSignUser } from "@/components/jwtHandler";
import { prismaUserGetOrCreate, prismaUserGetByUsername } from "@/models/user";
import { OrmState } from "@/models/enums";
import { errorHandlersOnSession } from "@/components/errorHandler";
import { User } from "@/models/user";

export async function middlewareAuth(
  ctx: Context<IMiddlewareAuth>,
  next: Next,
) {
  try {
    // تشخیص ربات‌ها (همیشه boolean)
    const userAgent = ctx.req.header("User-Agent")?.toLowerCase();
    const isBot = !!(
      userAgent?.includes("googlebot") || userAgent?.includes("bot")
    );
    ctx.set("isBot", isBot);

    if (isBot) {
      await next();
      return;
    }

    const tokenUser = getCookie(ctx, keyUser);
    let user: User | null = null;

    if (tokenUser) {
      try {
        const payload = await jwtVerifyUser({ token: tokenUser });
        if (payload?.id && typeof payload.id === "string") {
          const fetched = await prismaUserGetByUsername(payload.id);
          if (fetched !== OrmState.Error) {
            user = fetched;
          }
        }
      } catch {
        // توکن نامعتبر – نادیده گرفته می‌شود
      }
    }

    // اگر کاربر لاگین نیست، مهمان بساز
    if (!user) {
      const guestUsername = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const guest = await prismaUserGetOrCreate(guestUsername);
      if (guest !== OrmState.Error) {
        user = guest;
        const newToken = await jwtSignUser({ userName: guestUsername });
        ctx.header(
          "Set-Cookie",
          `${keyUser}=${newToken}; Path=/; HttpOnly; Max-Age=${60 * 60 * 24 * 365}`,
        );
      }
    }

    ctx.set("user", user);
    await next();
  } catch (error) {
    errorHandlersOnSession({ error, extra: { url: ctx.req.url } });
    return onErrorRestResponse({
      ctx,
      errorMessage: messageError.session.general,
    });
  }
}
