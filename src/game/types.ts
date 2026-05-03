export type PlayerId = string;

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
  id: string;
  players: PlayerId[];
  turn: PlayerId;
  dice?: number[];
  board: Board;
  createdAt: number;
}
