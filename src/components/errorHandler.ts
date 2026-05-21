import { Errors, OrmState } from "../models/enums";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";

export function errorHandlersOnPrisma({
  error,
  extra,
  title,
}: {
  error: any;
  extra?: any;
  title?: string;
}) {
  ErrorLogger({ error: error, errorType: Errors.Prisma, extra, title });
  return OrmState.Error;
}

// export function errorHandlersOnPrismaSession({
//   error,
//   extra,
//   title,
// }: {
//   error: any;
//   extra?: any;
//   title?: string;
// }) {
//   ErrorLogger({ error: error, errorType: Errors.PrismaSession, extra, title });
//   return OrmState.Error;
// }

//#region session
export function errorHandlersOnSession({
  error,
  extra,
  title,
}: {
  error: any;
  extra: any;
  title?: string;
}) {
  ErrorLogger({ error: error, errorType: Errors.Session, extra, title });
}
//#endregion session

//#region Route
export function errorHandlersOnRoute({
  error,
  extra,
  title,
}: {
  error: any;
  extra: any;
  title?: string;
}) {
  ErrorLogger({ error: error, errorType: Errors.Route, extra, title });
}
//#endregion Route

//#region Other
export function errorHandlersExtra({
  error,
  extra,
  title,
}: {
  error: any;
  extra?: any;
  title?: string;
}) {
  ErrorLogger({ error: error, errorType: Errors.Extra, title: title, extra });
}
//#endregion Other

//#region logger
export function onFileLogger({
  error,
  extra,
  title,
}: {
  error: any;
  extra?: any;
  title?: string;
}) {
  ErrorLogger({ error, errorType: Errors.JustLog, title, extra });
}

async function ErrorLogger({
  error,
  errorType,
  title,
  extra,
}: {
  errorType: Errors;
  error: any;
  title?: string;
  extra?: any;
}) {
  const date = new Date()
    .toLocaleDateString("en-IR", { month: "2-digit", day: "2-digit" })
    .replace("/", "_");

  const content = `
!title! :  ${title}
error :         
${error}

${JSON.stringify({ extra })}                    
=============================================================`;

  const dayPath = path.join(process.cwd(), "logs", date);

  if (!(await existsSync(dayPath)))
    await fs.mkdir(dayPath, { recursive: true });

  const logFilePath = path.join(dayPath, errorType.toString() + ".log");
  if (!(await existsSync(logFilePath)))
    await fs.writeFile(logFilePath, content);
  else await fs.appendFile(logFilePath, content);

  console.log({ errorType, content: error });
}
//#endregion logger
