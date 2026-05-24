export type PlayerId = string;

export interface PlayerInfo {
  /** شناسه بازیکن در سیستم یا همان socketId */
  id: PlayerId;
  /** رنگ بازیکن جهت حرکت */
  color: "white" | "black";
}

export interface Point {
  /** مالک مهره‌ها روی این نقطه (null اگر خالی) */
  owner: PlayerId | null;
  /** تعداد مهره‌ها روی نقطه */
  count: number;
}

/** وضعیت کلی صفحه برای هر بازیکن */
export interface Board {
  /** 24 نقطه تخته */
  points: Point[];
  /** مهره‌های در نوار (bar) */
  bar: Record<PlayerId, number>;
  /** مهره‌های خارج‌شده از تخته (borneOff) */
  borneOff: Record<PlayerId, number>;
}

/** وضعیت کامل یک بازی */
export interface GameState {
  /** شناسه بازی */
  id: string;

  /** لیست بازیکنان با رنگ و ID */
  players: PlayerInfo[];

  /** بازیکنی که نوبتش است */
  turn: PlayerId | null;

  /** وضعیت فعلی بازی */
  status: GameStatus;

  /** تاس جاری */
  dice?: number[];

  /** تاس‌های اولیه برای تعیین بازیکن شروع‌کننده */
  startingDice?: Record<PlayerId, number | undefined>;

  /** وضعیت تخته */
  board: Board;

  /** تعداد pip فعلی هر بازیکن */
  pipCount?: Record<PlayerId, number>;

  /** اطلاعات دوبلینگ */
  cubeValue?: number;
  cubeOwner?: PlayerId;
  cubeOffered?: PlayerId;

  /** اطلاعات پایان بازی */
  winner?: PlayerId;
  winType?: "normal" | "mars" | "backgammon";
  score?: number;

  /** زمان ایجاد بازی */
  createdAt: number;

  /** تایمر نوبت */
  turnStartedAt?: number;
  turnTimeLimit?: number;
  lastActionAt?: number;
}

export type GameStatus =
  | "waiting"
  | "ready"
  | "starting"
  | "in-progress"
  | "finished";

export const SPECIAL_POSITIONS = {
  BAR: -50,
  BEAR_OFF_BLACK: -100,
  BEAR_OFF_WHITE: 100,
};

export type SpecialPosition =
  (typeof SPECIAL_POSITIONS)[keyof typeof SPECIAL_POSITIONS];
