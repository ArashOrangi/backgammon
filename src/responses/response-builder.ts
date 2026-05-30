import {
  IDataResponse,
  IValidations,
  ResponseStates,
} from "@/responses/ResponseStates";
import { Context } from "hono";

//#region socket
export function onOkSocketResponse<T = undefined, X = undefined>(
  data?: T,
  message?: string,
  extra?: X,
): IDataResponse<T, X> {
  return {
    responseState: ResponseStates.Ok,
    data,
    extra,
    message,
    length: Array.isArray(data) ? data.length : undefined,
  };
}

// Validation errors
export function onValidationSocketResponse(
  validations: IValidations | string,
): IDataResponse {
  if (typeof validations === "string") {
    return {
      responseState: ResponseStates.Validations,
      message: validations,
    };
  }

  return {
    responseState: ResponseStates.Validations,
    validations,
  };
}

// Server error / generic error
export function onErrorSocketResponse(
  message: string,
  extra?: unknown,
): IDataResponse<undefined, unknown> {
  return {
    responseState: ResponseStates.ServerError,
    message,
    extra,
  };
}

export function onNotFoundMessageResponse(
  message = "Not found",
): IDataResponse {
  return {
    responseState: ResponseStates.NotFoundMessage,
    message,
  };
}

export function onNoAccessMessageResponse(
  message = "No access",
): IDataResponse {
  return {
    responseState: ResponseStates.NoAccessMessage,
    message,
  };
}

//برای پیام های خاص
export function onGameEventSocketResponse<T>(data: T, message?: string) {
  return {
    responseState: ResponseStates.Ok,
    data,
    message,
  };
}
//#endregion socket

//============================

//#region restAPI

export function onOkRestResponse<T, X>({
  ctx,
  data,
  extra,
  message,
  length,
}: {
  ctx: Context;
  data: T;
  message?: string;
  extra?: X;
  length?: number;
}) {
  return ctx.json(
    { responseState: ResponseStates.Ok, data, message, extra, length },
    200,
  );
}

export function onNeedLoginRestResponse({
  ctx,
  message,
}: {
  ctx: Context;
  message?: string;
}) {
  return ctx.json({ responseState: ResponseStates.NeedLogin, message }, 401);
}

export function onNotFoundRedirectRestResponse({
  ctx,
  redirectPath = "/404",
}: {
  ctx: Context;
  redirectPath?: string;
}) {
  return ctx.json(
    { responseState: ResponseStates.NotFoundRedirect, redirectPath },
    404,
  );
}

export function onValidationsRestResponse({
  ctx,
  validations,
  message,
}: {
  ctx: Context;
  validations: IValidations;
  message?: string;
}) {
  return ctx.json(
    { responseState: ResponseStates.Validations, validations, message },
    251 as any,
  );
}

export function onNotFoundMessageRestResponse({
  ctx,
  notFound,
}: {
  ctx: Context;
  notFound: string[];
}) {
  return ctx.json(
    { responseState: ResponseStates.NotFoundMessage, notFound },
    252 as any,
  );
}

export function onErrorRestResponse({
  ctx,
  errorMessage,
}: {
  ctx: Context;
  errorMessage: string;
}) {
  return ctx.json(
    { responseState: ResponseStates.ServerError, errorMessage },
    254 as any,
  );
}

export function onNoAccessMessageRestResponse({
  ctx,
  noAccess,
  message,
}: {
  ctx: Context;
  noAccess: string[];
  message?: string;
}) {
  return ctx.json(
    { responseState: ResponseStates.NoAccessMessage, noAccess, message },
    253 as any,
  );
}
//#endregion restAPI
