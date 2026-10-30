// POST { tag, difficulty: 1|2|3, count?, candles? } -> { questions: QuizQuestion[], source }
import { serveJson } from "../_shared/cors.ts";
import { generateQuiz, parseQuizRequest } from "./quiz.ts";

serveJson((body) => generateQuiz(parseQuizRequest(body)));
