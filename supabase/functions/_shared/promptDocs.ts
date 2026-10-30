// Markdown versions of the prompts for prompts/. Written by gen.ts, checked by selftest.ts.
import { CHART_VISION_TEMPLATE, QUIZ_TEMPLATE, TRADE_REVIEW_TEMPLATE } from "./prompts.ts";

const MODEL_NOTE =
  "Sent to Gemma 4 (`GEMMA_MODEL`, open-weight) through the Gemini API as a single user turn. " +
  "The reply is parsed as JSON, validated, and retried once with a correction note if invalid; " +
  "if Gemma still fails the function answers with a rule-based or canned fallback (`source: \"fallback\"`).";

export function promptDocs(): { file: string; template: string; markdown: string }[] {
  const docs = [
    {
      file: "trade-review.md",
      title: "Trade review prompt",
      fn: "review-trade",
      about:
        "Grades the reasoning behind a closed paper trade. All numbers in TRADE FACTS (P&L, stop distance, " +
        "risk/reward, position size, trend before entry, max favorable/adverse move) are computed in code; " +
        "the model never does math. The verdict rules are also re-applied in code from the score and the real P&L.",
      placeholders: "`{{FACTS_JSON}}` trade facts, `{{THESIS}}` the user's reason, `{{CANDLES}}` the 24 candles before entry as [open, high, low, close] with 5 significant digits (timestamps cost tokens and add nothing).",
      template: TRADE_REVIEW_TEMPLATE,
    },
    {
      file: "quiz.md",
      title: "Quiz prompt",
      fn: "generate-quiz",
      about:
        "Writes fresh multiple-choice questions for a lesson topic, optionally grounded in a numeric summary of real candles. " +
        "Gemma writes about 27 tokens/s here, so a quiz is split into parallel batches of up to 2 questions, each with its own " +
        "focus to avoid duplicates; only the first batch gets the candle summary. The code then shuffles the options so the " +
        "correct answer's position varies.",
      placeholders:
        "`{{TAG}}` lesson topic, `{{DIFFICULTY}}` 1-3, `{{COUNT}}` number of questions in this batch, " +
        "`{{FOCUS}}` the angle for this batch, " +
        "`{{CANDLE_SUMMARY_OR_EMPTY}}` first/last close, change %, high, low and up/down candle counts (or empty).",
      template: QUIZ_TEMPLATE,
    },
    {
      file: "chart-vision.md",
      title: "Chart vision prompt",
      fn: "analyze-chart",
      about: "Explains an uploaded chart screenshot (sent as an inline image part) and asks one follow-up question about it.",
      placeholders: "none; the image is sent as a second part.",
      template: CHART_VISION_TEMPLATE,
    },
  ];
  return docs.map((d) => ({
    file: d.file,
    template: d.template,
    markdown:
      `# ${d.title}\n\nUsed by the \`${d.fn}\` edge function (\`supabase/functions/${d.fn}/\`). ${d.about}\n\n` +
      `${MODEL_NOTE}\n\nPlaceholders: ${d.placeholders}\n\n` +
      `Source of truth: \`supabase/functions/_shared/prompts.ts\` (this file is generated from it).\n\n` +
      "```text\n" + d.template + "\n```\n",
  }));
}
