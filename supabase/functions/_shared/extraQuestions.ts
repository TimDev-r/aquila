// Hand-written fallback questions for topics that have no lesson in lessons.json yet.
import type { QuizQuestion } from "./contracts.ts";

export const EXTRA_QUESTIONS: QuizQuestion[] = [
  {
    id: "x-rr-1",
    question: "You buy at $100 with a stop at $95 and a target at $110. What is the risk/reward ratio?",
    options: ["1:2", "2:1", "1:1", "1:10"],
    correctIndex: 0,
    explanation: "You risk $5 to make $10, so the reward is twice the risk. That is written 1:2.",
    tag: "risk_reward",
  },
  {
    id: "x-rr-2",
    question: "Your trades risk $50 to make $150. Roughly what share of them must win to break even?",
    options: ["75%", "50%", "25%", "90%"],
    correctIndex: 2,
    explanation: "One win of $150 covers three losses of $50. Winning 1 in 4 trades (25%) breaks even before fees.",
    tag: "risk_reward",
  },
  {
    id: "x-rr-3",
    question: "Which plan has the better risk/reward?",
    options: [
      "Stop 2% below entry, target 1% above entry",
      "Stop 1% below entry, target 1% above entry",
      "No stop, target 5% above entry",
      "Stop 1% below entry, target 3% above entry",
    ],
    correctIndex: 3,
    explanation: "Risking 1% to make 3% is a 1:3 ratio. Without a stop the risk is unknown, so it cannot be measured.",
    tag: "risk_reward",
  },
  {
    id: "x-rr-4",
    question: "A trade hits its stop and loses. Your plan had a 1:2 risk/reward and a clear reason. What does this mean?",
    options: [
      "The plan was wrong and you should stop using stops.",
      "A good plan can still lose; judge it over many trades.",
      "You should move the stop further away next time.",
      "You should double the size to win it back.",
    ],
    correctIndex: 1,
    explanation: "Risk/reward works over a series of trades, not each one. Single losses are expected.",
    tag: "risk_reward",
  },
];
