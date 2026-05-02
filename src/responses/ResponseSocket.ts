import { IDataResponse, ResponseStates, IValidations } from "./ResponseStates";

export function onOkSocketResponse<T>(
  data?: T,
  message?: string,
): IDataResponse<T> {
  return {
    responseState: ResponseStates.Ok,
    data,
    message,
    length: Array.isArray(data) ? data.length : undefined,
  };
}

export function onValidationSocketResponse(
  validations: IValidations,
  message = "Validation error",
): IDataResponse {
  return {
    responseState: ResponseStates.Validations,
    message,
    validations,
  };
}

export function onErrorSocketResponse(message: string): IDataResponse {
  return {
    responseState: ResponseStates.ServerError,
    message,
  };
}
