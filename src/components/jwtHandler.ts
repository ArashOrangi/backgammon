import { secretTokenSession, secretTokenUser } from "@/static/statics";
import { jwtVerify, SignJWT } from "jose";
// import { sign, verify } from "hono/jwt";

const alg = "HS256";

// session
export async function jwtSignSession({ id }: { id: string }) {
  const jwt = await new SignJWT({ id })
    .setProtectedHeader({ alg })
    .sign(new TextEncoder().encode(secretTokenSession));
  // const jwt = await sign({ id }, secretTokenSession);

  return jwt;
}

export async function jwtVerifySession({ token }: { token: string }) {
  const validToken = await jwtVerify(
    token,
    new TextEncoder().encode(secretTokenSession),
  );
  // const validToken = await verify(token, secretTokenSession);

  return validToken.payload;
  // return validToken;
}

// user
export async function jwtSignUser({ userName }: { userName: string }) {
  const jwt = await new SignJWT({ id: userName })
    .setProtectedHeader({ alg })
    .sign(new TextEncoder().encode(secretTokenUser));
  // const jwt = await sign({ userName }, secretTokenUser);

  return jwt;
}

export async function jwtVerifyUser({ token }: { token: string }) {
  const validToken = await jwtVerify(
    token,
    new TextEncoder().encode(secretTokenUser),
  );
  // const validToken = await verify(token, secretTokenUser);

  return validToken.payload;
  // return validToken;
}
