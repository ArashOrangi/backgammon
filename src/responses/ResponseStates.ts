//TODO ask in sprint talks
export enum ResponseStates {
  Ok = 200,
  NeedLogin = 401,
  NoAccessRedirect = 403,
  NotFoundRedirect = 404,
  DeletedRedirect = 410,
  MovedPermanent = 301,
  RedirectTemporary = 307,
  ServerError = 500,

  Validations = 251,
  NotFoundMessage = 252,
  NoAccessMessage = 253,
}

export interface IValidations {
  [key: string]: string[] | undefined;
}

export interface IDataResponse<T = undefined, X = undefined> {
  responseState: ResponseStates;
  data?: T;
  extra?: X;
  message?: string;
  validations?: IValidations;
  length?: number;
}
