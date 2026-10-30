# Edge-function samples

Request bodies built from the real candles in `src/data/replay/` (regenerate: `npx tsx scripts/build-samples.ts`).
Call one: `npx tsx scripts/call-function.ts <function-name> <file>` (needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env.local`).

- `trades/lucky-win.json` – review-trade: gut-feeling long with no stop that caught the demo rally (+4%); expect "lucky".
- `trades/unlucky-loss.json` – review-trade: clear support thesis, sensible stop, 1:2 risk/reward, stopped out; expect "unlucky".
- `trades/great-win.json` – review-trade: uptrend + tested support + small risk, 1:2 target hit; expect "great".
- `trades/oversized.json` – review-trade: support idea but 60% of the balance in one trade, stopped out; expect "poor".
- `trades/tight-stop.json` – review-trade: stop 0.05% from entry, knocked out by noise before price moved up; expect "poor".
- `trades/good-short.json` – review-trade: short after a failed breakout, stop above the spike, target hit; expect "good".
- `trades/level-no-stop.json` – review-trade: support idea with no stop, closed by hand after a 1.5% drop; expect "poor".
- `trades/early-manual-exit.json` – review-trade: good support plan, closed by hand at +0.5% before the target; expect "good".
- `trades/take-profit-hit.json` – review-trade: simple pullback buy with a stop, target hit; expect "good".
- `trades/stop-hit.json` – review-trade: FOMO buy after a big green candle, stopped out; expect "poor".
- `trades/expected.json` – the expected verdict for each trade file above.
- `quiz/stop-loss-d1.json` – generate-quiz: stop_loss, difficulty 1, 5 questions.
- `quiz/trend-d2.json` – generate-quiz: trend, difficulty 2, 5 questions, with the clean-uptrend candles.
- `quiz/psychology-d3.json` – generate-quiz: psychology, difficulty 3, 5 questions.
- `speak.json` – speak: one coach line to turn into audio.
