import lessonsData from "@/content/lessons.json";
import type { Lesson } from "@/lib/contracts";

/**
 * Unit 0 — financial literacy basics, before any trading content.
 * Kept in a separate file because src/content/lessons.json is owned by a teammate.
 */
export const UNIT0_LESSONS: Lesson[] = [
  {
    id: "l0-budget",
    order: -3,
    tag: "psychology",
    title: "Money In, Money Out",
    intro: [
      "A budget is simply a plan for your money: what comes in, what goes out, and what stays. You cannot grow money you never keep.",
      "A simple starting rule is 50/30/20: about 50% of income for needs (rent, food, transport), 30% for wants, and 20% for saving and investing.",
      "Track your spending for one month before judging it. Most people are surprised where the money actually goes.",
    ],
    questions: [
      {
        id: "l0-q1",
        question: "What is a budget?",
        options: [
          "A plan for what comes in, what goes out, and what stays.",
          "A loan from the bank.",
          "A type of investment account.",
          "A tax you pay on savings.",
        ],
        correctIndex: 0,
        explanation: "A budget is just a plan for your money. It tells your money where to go instead of wondering where it went.",
        tag: "psychology",
      },
      {
        id: "l0-q2",
        question: "In the 50/30/20 rule, what is the 20% for?",
        options: [
          "Needs like rent and food.",
          "Wants like eating out.",
          "Saving and investing.",
          "Bank fees.",
        ],
        correctIndex: 2,
        explanation: "The 20% slice goes to your future: savings and investments. Needs take 50%, wants take 30%.",
        tag: "psychology",
      },
      {
        id: "l0-q3",
        question: "You earn €2,000 a month and spend €2,100. What is the first problem to fix?",
        options: [
          "You need a riskier investment.",
          "You spend more than you earn, so savings can never grow.",
          "You need a second bank account.",
          "Nothing, €100 is small.",
        ],
        correctIndex: 1,
        explanation: "Spending more than you earn means debt grows every month. No investment can fix a leaking bucket.",
        tag: "psychology",
      },
      {
        id: "l0-q4",
        question: "What is a good first step before making a budget?",
        options: [
          "Track your actual spending for a month.",
          "Cancel all subscriptions immediately.",
          "Open a trading account.",
          "Ask friends what they earn.",
        ],
        correctIndex: 0,
        explanation: "You can't plan what you don't measure. A month of tracking shows where money really goes.",
        tag: "psychology",
      },
    ],
    xp: 15,
  },
  {
    id: "l0-interest",
    order: -2,
    tag: "risk_reward",
    title: "Interest & Compound Growth",
    intro: [
      "Interest is the price of money. When you save, the bank pays you interest. When you borrow, you pay it.",
      "Compound growth means earning interest on your interest. €1,000 at 5% becomes €1,050, then 5% of €1,050, and so on — growth speeds up over time.",
      "Time matters more than timing. Starting to save at 20 instead of 30 can nearly double the final amount, even with the same monthly saving.",
    ],
    questions: [
      {
        id: "l0-q5",
        question: "What is compound growth?",
        options: [
          "Earning interest on your interest, so growth speeds up over time.",
          "Paying two taxes on the same income.",
          "A bonus your bank pays once a year.",
          "Splitting money across two accounts.",
        ],
        correctIndex: 0,
        explanation: "Each round of interest is calculated on a bigger amount than the last. That snowball effect is compounding.",
        tag: "risk_reward",
      },
      {
        id: "l0-q6",
        question: "€1,000 grows at 10% per year. Roughly how much is it after 2 years?",
        options: [
          "€1,100",
          "€1,200",
          "€1,210",
          "€2,000",
        ],
        correctIndex: 2,
        explanation: "Year 1: €1,100. Year 2: 10% of €1,100 = €110, so €1,210. The extra €10 is interest on interest.",
        tag: "risk_reward",
      },
      {
        id: "l0-q7",
        question: "Two people save the same monthly amount at the same return. One starts at 20, the other at 30. Who ends with more?",
        options: [
          "The one who started at 30, they earn more by then.",
          "The one who started at 20, compounding had ten extra years.",
          "They end with exactly the same amount.",
          "Whoever picked better stocks.",
        ],
        correctIndex: 1,
        explanation: "Ten extra years of compounding can nearly double the final amount. Time in the market beats timing the market.",
        tag: "risk_reward",
      },
      {
        id: "l0-q8",
        question: "A credit card charges 20% interest per year. Your savings account pays 3%. What should you do first?",
        options: [
          "Invest in stocks to beat 20%.",
          "Pay off the card debt before saving more.",
          "Save more at 3% and ignore the card.",
          "Take a second card to pay the first.",
        ],
        correctIndex: 1,
        explanation: "Paying off 20% debt is a guaranteed 20% return. No safe investment beats that.",
        tag: "risk_reward",
      },
    ],
    xp: 15,
  },
  {
    id: "l0-safety",
    order: -1,
    tag: "risk_reward",
    title: "Safety Before Risk",
    intro: [
      "An emergency fund is cash covering 3–6 months of essential costs, kept somewhere safe and easy to reach. It is your financial seatbelt.",
      "Only invest money you will not need for years. Markets can drop 30% in a bad year — if you must sell then, the loss becomes real.",
      "If someone promises high returns with no risk, it is a scam. Return and risk always travel together.",
    ],
    questions: [
      {
        id: "l0-q9",
        question: "What is an emergency fund?",
        options: [
          "Money set aside for holidays.",
          "Cash covering 3–6 months of essential costs, kept safe and reachable.",
          "A loan you take in an emergency.",
          "Your trading account balance.",
        ],
        correctIndex: 1,
        explanation: "An emergency fund covers essentials like rent and food if income stops. It keeps you from selling investments at the worst time.",
        tag: "risk_reward",
      },
      {
        id: "l0-q10",
        question: "Why should you build an emergency fund before investing?",
        options: [
          "Banks require it by law.",
          "So a surprise expense never forces you to sell investments at a loss.",
          "It earns higher returns than stocks.",
          "It reduces your taxes.",
        ],
        correctIndex: 1,
        explanation: "Without a cash buffer, any surprise — a broken car, a lost job — can force you to sell investments at the worst moment.",
        tag: "risk_reward",
      },
      {
        id: "l0-q11",
        question: "Someone online promises 10% profit per month, guaranteed. What is this?",
        options: [
          "A rare opportunity.",
          "A scam — high guaranteed returns do not exist.",
          "A normal savings account.",
          "A government bond.",
        ],
        correctIndex: 1,
        explanation: "10% per month is over 200% per year. Guaranteed high returns are the classic sign of a scam.",
        tag: "risk_reward",
      },
      {
        id: "l0-q12",
        question: "You will need €5,000 for a car in six months. Where does that money belong?",
        options: [
          "In a volatile crypto coin.",
          "In a long-term stock fund.",
          "Somewhere safe and stable, like a savings account.",
          "In a leveraged trade.",
        ],
        correctIndex: 2,
        explanation: "Money needed soon cannot afford a downturn. Short-term money stays safe; long-term money can take risk.",
        tag: "risk_reward",
      },
    ],
    xp: 15,
  },
];

/** Every lesson in the app: Unit 0 (financial literacy) + Unit 1 (trading, teammate-owned JSON). */
export const ALL_LESSONS: Lesson[] = [...UNIT0_LESSONS, ...(lessonsData.lessons as Lesson[])].sort(
  (a, b) => a.order - b.order,
);
