import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { getAllProvinces, getCitiesByProvince } from "@/models/location";
import { OrmState } from "@/models/enums";
import { validator } from "@/components/validator";
import { ProvinceIdSchema } from "@/validations/location.schema";

export const locationRoutes = new Hono();

// ===== دریافت لیست استان‌ها =====
locationRoutes.get("/provinces", async (c) => {
  try {
    const provinces = await getAllProvinces();
    if (provinces === OrmState.Error) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Failed to fetch provinces",
      });
    }
    return onOkRestResponse({ ctx: c, data: provinces });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch provinces",
    });
  }
});

// ===== دریافت شهرهای یک استان =====
locationRoutes.get("/provinces/:provinceId/cities", async (c) => {
  try {
    const provinceIdRaw = c.req.param("provinceId");
    const validation = validator({
      data: { provinceId: Number(provinceIdRaw) },
      schema: ProvinceIdSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const provinceId = validation.data.provinceId;
    const cities = await getCitiesByProvince(provinceId);
    if (cities === OrmState.Error) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Failed to fetch cities",
      });
    }
    return onOkRestResponse({ ctx: c, data: cities });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch cities",
    });
  }
});
