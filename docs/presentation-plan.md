# Aquila – Pitch & Presentation Plan

3-minute pitch structured for hackathon judging (Emotional hook, cold hard facts, live MVP demo, and track alignment).

---

## 1. Timeline & Flow

| Time | Section | Focus |
|---|---|---|
| **0:00 – 0:35** | **The Hook & Shocking Facts** | Emotional contrast: 70%+ retail losers vs casino apps |
| **0:35 – 0:55** | **Duolingo-Style Learning** | Lessons, XP, streaks, interactive wrong-answer feedback |
| **0:55 – 1:45** | **The Hero Demo: "The Lucky Trade"** | Thesis enforcement, Replay mode, profit, Gemma 4 "Lucky" verdict |
| **1:45 – 2:15** | **Aquila Voice & Chart Vision** | ElevenLabs voice reads verdict, Gemma 4 multimodal chart analysis |
| **2:15 – 3:00** | **Tech Tracks & Mic Drop** | Gemma 4, ElevenLabs, Lovable, Open Source, "Watch. Think. Strike." |

---

## 2. Spoken Script & Stage Clicks

### 0:00 – 0:35: The Hook (Facts & Emotion)
**Visual:** Presenter standing, eye contact with judges.

> "Judges, quick question: Have you or someone you know ever bought a crypto coin or stock because of a tweet, hype, or just a 'good feeling'?
>
> Here is the brutal reality: Under EU and UK financial regulations, brokers are legally required to disclose customer outcomes. **Over 70% of retail investor accounts lose money.** In some brokerages, it's over 80%.
>
> Why? Because modern trading apps are designed like casinos. They celebrate gambling. You enter on a hunch, you get lucky, green confetti explodes on your screen, and your brain thinks: 'I'm a genius.' Then revenge trading wipes out your entire savings.
>
> We built **Aquila**: Duolingo for trading, where an AI coach grades your **reasoning**, not your profit. Our tagline: **Trade with a reason, not a hunch.**"

---

### 0:35 – 0:55: Learning Foundation
**Visual:** Screen on `/` (Learn page).
**Actions:**
1. Show streaks, XP, and hearts in the header.
2. Click **Lesson 4: The Stop Loss**.
3. Choose the wrong answer intentionally: *"At $30 to give it lots of room."*
4. Show the heart drop and the immediate pedagogical explanation.

> "We start with bite-sized lessons: candles, trends, stop losses, and position sizing. No jargon, concrete numbers. If you guess carelessly, you lose a heart. But theory alone doesn't build discipline—you need to practice under market pressure."

---

### 0:55 – 1:45: The "Lucky Trade" Demo (Climax)
**Visual:** Click **Trade** (`/trade`), switch to **Replay**.
**Actions:**
1. Scenario: **Ethereum at a crossroads** (`demo-lucky-win`).
2. Order Panel: Long, leave Stop Loss empty.
3. Show that the Buy button is disabled without a thesis.
4. Type thesis: `feels like it will go up, I have a good feeling`.
5. Click **Buy ETH**, toggle speed to **4x**.
6. When price spikes green and P&L is positive, click **Close Position**.

> "This is our paper trading engine running on historical Binance data. Notice: Aquila won't even let you place an order without writing a thesis.
> 
> I go long with zero stop loss and write: 'feels like it will go up, I have a good feeling.' Let's speed up time... boom! I'm in profit! In any other app, confetti would rain down right now."

---

### 1:45 – 2:15: The Verdict & Aquila Voice
**Visual:** `TradeReviewDialog` opens with the **Gemma 4** badge.
**Actions:**
1. Point to **Score: 25/100 – Verdict: LUCKY**.
2. Be silent and let Aquila's ElevenLabs voice play through room audio:
   *"You made a profit, but you had no stop loss and no invalidation level. Winning on a hunch is just gambling that hasn't caught up to you yet."*
3. Click **Chart Vision** (`/vision`) -> **Try a sample chart** to show multimodal vision.

> "Instead, Gemma 4 evaluates my trade thesis against the price structure. The verdict? **LUCKY**. Aquila's ElevenLabs voice explains why: winning on a hunch is just gambling that hasn't caught up to you yet.
> 
> We also built Chart Vision: drop in any chart screenshot, and Gemma 4 identifies key levels and creates an instant quiz."

---

### 2:15 – 3:00: Closing & Prize Tracks
**Visual:** Back to `/` Learn dashboard or repo.

> "In 4 hours, our team shipped:
> - **Gemma 4** (open-weight AI via Gemini API) grading reasoning and reading charts.
> - **ElevenLabs** bringing Aquila to life with warm, low-latency audio coaching.
> - **Lovable** powering the full-stack TanStack Start application.
> - And 100% **Open Source** under the MIT license.
>
> Most apps teach you how to gamble. Aquila teaches you how to think.  
> **Watch. Think. Then strike.** Thank you!"
