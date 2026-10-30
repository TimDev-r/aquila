// POST { trade: Trade, candles: Candle[] } -> TradeReview
import { serveJson } from "../_shared/cors.ts";
import { parseReviewRequest, reviewTrade } from "./review.ts";

serveJson((body) => {
  const { trade, candles } = parseReviewRequest(body);
  return reviewTrade(trade, candles);
});
