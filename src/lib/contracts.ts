export type Candle = {
  time: number;   // UNIX seconds, UTC (candle open time)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Interval = "1m" | "5m" | "15m" | "1h" | "1d";

export type LessonTag =
  | "candles" | "trend" | "support_resistance" | "stop_loss"
  | "position_sizing" | "risk_reward" | "psychology";

export type Side = "long" | "short";
export type ExitReason = "manual" | "stop_loss" | "take_profit";

export type Trade = {
  id: string;
  symbol: string;            // e.g. "BTCUSDT"
  side: Side;
  size: number;              // units of the asset, e.g. 0.05 BTC
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  thesis: string;            // the user's reason, min 20 characters
  openedAt: number;          // UNIX seconds
  closedAt: number | null;
  pnl: number | null;        // in USDT, set when closed
  exitReason: ExitReason | null;
};

export type Account = {
  startingBalance: number;   // 10000 USDT
  balance: number;           // cash, realized P&L included
  openTrades: Trade[];
  closedTrades: Trade[];
};

export type Source = "gemma" | "fallback" | "mock";

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];         // exactly 4
  correctIndex: number;      // 0-3
  explanation: string;       // max 2 sentences
  tag: LessonTag;
};

export type Lesson = {
  id: string;                // e.g. "l1-candles"
  order: number;
  tag: LessonTag;
  title: string;
  intro: string[];           // 2-4 short teaching cards
  questions: QuizQuestion[]; // exactly 4
  xp: number;                // 10-20
};

export type TradeReview = {
  score: number;             // 0-100, grades REASONING not profit
  verdict: "great" | "good" | "lucky" | "unlucky" | "poor";
  summary: string;
  whatWentWell: string[];
  mistakes: string[];
  lessonTag: LessonTag;
  coachLine: string;         // max 25 words, read aloud
  source: Source;
};

export type ChartAnalysis = {
  isChart: boolean;
  pattern: string;
  trend: "up" | "down" | "sideways" | "unclear";
  explanation: string;
  keyLevels: string[];
  followUp: QuizQuestion;
  source: Source;
};

export type ReplayScenario = {
  id: string;
  title: string;
  description: string;
  symbol: string;
  interval: Interval;
  candles: Candle[];
  revealFrom: number;        // index where guessing starts
};

export type MascotMood = "neutral" | "thinking" | "proud" | "disappointed" | "celebrating";
