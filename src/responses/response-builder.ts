import {
  IDataResponse,
  IValidations,
  ResponseStates,
} from "@/responses/ResponseStates";

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
