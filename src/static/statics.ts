import process from "node:process";
import dotenv from "dotenv";
dotenv.config();

export const portApp = Number(process.env.PORT) || 3000;
export const portSocket = Number(process.env.PORT) || 3001;
export const sitURL = process.env.API_URL;

export const BOT_USER_ID = 1;

export const keyPublic = "BwdN45bMapeCnUdU7DIQc8DiHwUVVvVwhHEMvxk03ys";
export const keyUser = "gwLXSgG3jqMH67YfwE4lkzfk1Jj1cN0LC3hcEat0k14JZqeWnWXt9C";

export const secretTokenUser = process.env.SECRET_USER ?? "";
export const secretTokenSession = process.env.SECRET_SESSION ?? "";

const dayInSecond = 86400;
export const keyPublicAge = dayInSecond * 365; //"365 day in second"
export const keyUserAgeShort = dayInSecond * 7; //"1 day in second"
export const keyUserAgeLong = dayInSecond * 180; //"90 day in second"

export const userPasswordLength = 8;
export const phoneNumberLength = 11;

//TODO ask in sprint
export const otpLength = 5;
export const otpAge = 10 * 60 * 1000; // 10 minutes;
export const otpResend = 5 * 60 * 1000; // 5 minutes;
export const otpMin = 2 * 60 * 1000; // 2 minutes;

//TODO when we need notifications
// export const webPushKeyPublic = process.env.WEBPUSH_PUBLIC ?? "";
// export const webPushKeyPrivate = process.env.WEBPUSH_PRIVATE ?? "";
