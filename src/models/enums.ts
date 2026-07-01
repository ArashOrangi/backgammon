//ساخت فایل مشترک برای enumهای هم سرور و هم کلاینت
export enum ErrorCause {
  None,
  Validation,
  Error,
  Private,
}

export enum Genders {
  None,
  Man,
  Woman,
}

export enum FollowStates {
  Submitted = "SUBMITTED",
  Requested = "REQUESTED",
  Rejected = "REJECTED",
}

export enum ChatActions {
  Send = "send",
  Receive = "receive",
  Writhe = "writhe",
  Seen = "seen",
}

export enum ApiMethods {
  Get = "get",
  Post = "post",
}

export enum LoginStates {
  Register,
  OtpMethod,
  CheckPassword,
  LoggedIn,
  CheckOTP,
}

// just api
export enum OrmState {
  Error = "prismaError",
}

export enum FollowRequestStates {
  Requests,
  Accepted,
}

// errors
export enum Errors {
  Prisma = "Prisma",
  Session = "Session",
  Route = "Route",
  Extra = "Extra",
  JustLog = "JustLog",
}

export enum STATUS {
  waiting = "waiting",
  starting = "starting",
  inProgress = "in-progress",
  finished = "finished",
}

export enum EventTypes {
  PLAYER_JOINED = "PLAYER_JOINED",
  PLAYER_LEFT = "PLAYER_LEFT",
  DICE_ROLLED = "DICE_ROLLED",
  MOVE_APPLIED = "MOVE_APPLIED",
  CUBE_OFFERED = "CUBE_OFFERED",
  CUBE_ACCEPTED = "CUBE_ACCEPTED",
  CUBE_REJECTED = "CUBE_REJECTED",
  GAME_FINISHED = "GAME_FINISHED",
}
