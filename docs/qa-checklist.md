# Aquila – QA Checklist

Run this checklist from 4:45 PM across both a desktop/laptop browser and a mobile device (or 375px responsive view).

## Core Verification Checklist

- [ ] **1. Lessons Load:** All 6 lessons load on the Learn (`/`) page with correct titles, tags, and XP amounts (Candlesticks, Trends, Support/Resistance, Stop Loss, Position Sizing, Mindset).
- [ ] **2. Lesson Completion & Persistence:** A lesson plays through all intro cards and questions to the finish screen; XP and streak update in the header and survive a browser page reload (`localStorage`).
- [ ] **3. Live Market Data:** Trade page (`/trade`) connects to the live Binance feed and displays fluctuating live BTC price and candlesticks.
- [ ] **4. Replay Mode Execution:** In Replay mode, selecting `Ethereum at a crossroads` (`demo-lucky-win`) plays historical candles at 1x, 2x, and 4x speeds.
- [ ] **5. Thesis Enforcement:** In the Order Panel, trying to place a trade without a written reason (or with fewer than 20 characters) keeps the Buy/Sell button disabled.
- [ ] **6. Trade Review & Gemma 4 Badge:** Closing an open trade displays the `TradeReviewDialog` with a score, explanation, and the active **Gemma 4** badge (or **Offline coach** badge if offline).
- [ ] **7. Lucky Trade Verdict & Voice Coach:** The demo lucky trade (long with no stop loss and thesis: *"feels like it will go up, I have a good feeling"*) receives a **"lucky"** verdict and score, and Aquila's voice speaks the `coachLine` aloud via ElevenLabs (with working replay & mute toggles).
- [ ] **8. Next Candle Game:** Next Candle (`/replay`) plays 10 consecutive rounds (Higher / Lower guesses) with score tracking and shows the AI trend analysis tip upon completion.
- [ ] **9. Chart Vision:** Chart Vision (`/vision`) analyzes both the built-in sample chart ("Try a sample chart") and an uploaded screenshot, extracting pattern, trend, key levels, and an interactive follow-up question.
- [ ] **10. Practice Quiz Generation:** Practice (`/practice`) generates 5 fresh quiz questions for any chosen topic and difficulty level.
- [ ] **11. Offline Fallback:** With Wi-Fi / network disconnected, the app continues to operate without crashing: Replay trading works, trade reviews open with the "Offline coach" badge, and voice falls back to Web Speech synthesis.
- [ ] **12. Responsive Mobile Layout:** Layout renders without horizontal clipping or overlapping buttons at 375px mobile viewport width.
- [ ] **13. Open Source Repository Integrity:** GitHub repository is public, containing the MIT `LICENSE`, comprehensive `README.md`, and clean commit history.

---

## Bug Report Format
When filing bugs with teammates, copy and paste this exact template:

```markdown
**Page:** [e.g. /trade, /lesson/l4-stop-loss, /vision]
**Steps to Reproduce:**
1. ...
2. ...
**Expected:** [What should happen]
**Actual:** [What actually happened / error console message]
**Owner:** [Person 1 (UI/Config) | Person 2 (AI/prompts) | Person 3 (Market data/Trading) | Person 4 (Voice/Content)]
```
