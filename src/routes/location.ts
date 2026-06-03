import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { getAllProvinces, getCitiesByProvince } from "@/models/location";
import { OrmState } from "@/models/enums";

export const locationRoutes = new Hono();

// دریافت لیست استان‌ها
locationRoutes.get("/provinces", async (c) => {
  const provinces = await getAllProvinces();
  if (provinces === OrmState.Error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch provinces",
    });
  }
  return onOkRestResponse({ ctx: c, data: provinces });
});

// دریافت شهرهای یک استان
locationRoutes.get("/provinces/:provinceId/cities", async (c) => {
  const provinceId = Number(c.req.param("provinceId"));
  if (isNaN(provinceId)) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { provinceId: ["Must be a number"] },
    });
  }
  const cities = await getCitiesByProvince(provinceId);
  if (cities === OrmState.Error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch cities",
    });
  }
  return onOkRestResponse({ ctx: c, data: cities });
});
