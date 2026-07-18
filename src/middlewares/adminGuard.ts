import { Context, Next } from "hono";
import { onErrorRestResponse } from "@/responses/response-builder";

// لیست شناسه‌های کاربران ادمین (می‌توانید از دیتابیس یا env بخوانید)
const ADMIN_USER_IDS = [1, 2, 3]; // تغییر دهید

export async function adminGuard(ctx: Context, next: Next) {
  const user = ctx.get("user");

  if (!user) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Not authenticated",
    });
  }
  //TODO
  // if (!ADMIN_USER_IDS.includes(user.id)) {
  //   return onErrorRestResponse({
  //     ctx,
  //     errorMessage: "Admin access required",
  //   });
  // }

  await next();
}
