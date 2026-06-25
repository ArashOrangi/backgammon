import { User } from "./user";

export interface IMiddlewareAuth {
  Variables: {
    isBot: boolean;
    user?: User | null;
  };
}

// برای سازگاری با کدهای قدیمی (در صورت نیاز)
export interface IMiddlewareSession {
  Variables: {
    isBot: boolean;
    userId?: number;
  };
}

export interface IMiddlewareUser {
  Variables: {
    isBot: boolean;
    user?: User | null;
  };
}

export interface IMiddlewareProfile {
  Variables: {
    isBot: boolean;
    user?: User;
  };
}
