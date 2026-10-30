// POST { imageBase64 (no data: prefix), mimeType } -> ChartAnalysis
import { serveJson } from "../_shared/cors.ts";
import { analyzeChart, parseChartRequest } from "./analyze.ts";

serveJson((body) => {
  const { imageBase64, mimeType } = parseChartRequest(body);
  return analyzeChart(imageBase64, mimeType);
});
