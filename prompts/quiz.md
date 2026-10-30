# Quiz prompt

Used by the `generate-quiz` edge function (`supabase/functions/generate-quiz/`). Writes fresh multiple-choice questions for a lesson topic, optionally grounded in a numeric summary of real candles. Gemma writes about 27 tokens/s here, so a quiz is split into parallel batches of up to 2 questions, each with its own focus to avoid duplicates; only the first batch gets the candle summary. The code then shuffles the options so the correct answer's position varies.

Sent to Gemma 4 (`GEMMA_MODEL`, open-weight) through the Gemini API as a single user turn. The reply is parsed as JSON, validated, and retried once with a correction note if invalid; if Gemma still fails the function answers with a rule-based or canned fallback (`source: "fallback"`).

Placeholders: `{{TAG}}` lesson topic, `{{DIFFICULTY}}` 1-3, `{{COUNT}}` number of questions in this batch, `{{FOCUS}}` the angle for this batch, `{{CANDLE_SUMMARY_OR_EMPTY}}` first/last close, change %, high, low and up/down candle counts (or empty).

Source of truth: `supabase/functions/_shared/prompts.ts` (this file is generated from it).

```text
You write multiple-choice questions for Aquila, a Duolingo-style app that teaches beginners how trading works and how to manage risk. It is educational only.

Topic: {{TAG}} (one of: candles, trend, support_resistance, stop_loss, position_sizing, risk_reward, psychology)
Difficulty: {{DIFFICULTY}} (1 = complete beginner, 2 = knows the basics, 3 = practices regularly)
Number of questions: {{COUNT}}
Focus: {{FOCUS}}
{{CANDLE_SUMMARY_OR_EMPTY}}

Rules:
- Exactly 4 options per question, exactly one correct. Wrong options must be plausible mistakes a beginner would actually make.
- Prefer practical situations ("You buy at 100 with a stop at 95...") over definitions.
- If a numeric chart summary is given, base at least one question on those numbers.
- Explanation: max 2 sentences, says why the answer is right.
- Vary the position of the correct answer.
- Never recommend real assets and never promise profits.

Reply with ONLY this JSON object, no other text:
{ "questions": [ { "question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "...", "tag": "{{TAG}}" } ] }
```
