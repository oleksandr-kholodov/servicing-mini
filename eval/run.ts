/**
 * Eval harness for LLM classifier.
 *
 * Usage:
 *   npm run eval                    # runs stub (deterministic, no keys needed)
 *   LLM_PROVIDER=anthropic npm run eval  # runs real Anthropic provider
 *   LLM_PROVIDER=openai npm run eval     # runs real OpenAI provider
 *
 * Outputs: accuracy, per-intent accuracy, confusion matrix.
 */

import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { GOLDEN_CASES } from "./golden";
import { resetClassifier } from "../src/lib/classifier/factory";
import { getClassifier } from "../src/lib/classifier/factory";

type Intent = string;
type ConfusionRow = Record<Intent, number>;

async function runEval() {
  const classifier = getClassifier();
  console.log(`\n=== Eval: ${classifier.providerName} provider ===`);
  console.log(`Cases: ${GOLDEN_CASES.length}\n`);

  const intents = [...new Set(GOLDEN_CASES.map((c) => c.expectedIntent))];
  const confusion: Record<Intent, ConfusionRow> = {};
  for (const i of intents) {
    confusion[i] = {};
    for (const j of intents) confusion[i]![j] = 0;
  }

  let correct = 0;
  const results: { id: string; expected: string; got: string; confidence: number; ok: boolean }[] = [];

  for (const tc of GOLDEN_CASES) {
    const result = await classifier.classify({ text: tc.text });
    const ok = result.intent === tc.expectedIntent;
    if (ok) correct++;
    if (!confusion[tc.expectedIntent]) confusion[tc.expectedIntent] = {};
    confusion[tc.expectedIntent]![result.intent] = (confusion[tc.expectedIntent]![result.intent] ?? 0) + 1;
    results.push({ id: tc.id, expected: tc.expectedIntent, got: result.intent, confidence: result.confidence, ok });
  }

  // Print per-case results
  console.log("Per-case results:");
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    const conf = (r.confidence * 100).toFixed(0);
    console.log(`  ${icon} ${r.id.padEnd(16)} expected=${r.expected.padEnd(16)} got=${r.got.padEnd(16)} conf=${conf}%`);
  }

  // Per-intent accuracy
  console.log("\nPer-intent accuracy:");
  for (const intent of intents) {
    const row = confusion[intent] ?? {};
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    const tp = row[intent] ?? 0;
    const acc = total > 0 ? (tp / total) * 100 : 0;
    console.log(`  ${intent.padEnd(20)} ${tp}/${total} = ${acc.toFixed(0)}%`);
  }

  // Confusion matrix header
  const intentLabels = intents.map((i) => i.slice(0, 8).padStart(9));
  console.log("\nConfusion matrix (rows=expected, cols=predicted):");
  console.log("            " + intentLabels.join(""));
  for (const expected of intents) {
    const row = intents.map((pred) => String(confusion[expected]?.[pred] ?? 0).padStart(9));
    console.log(`  ${expected.slice(0, 10).padEnd(10)} ${row.join("")}`);
  }

  const accuracy = (correct / GOLDEN_CASES.length) * 100;
  console.log(`\nOverall accuracy: ${correct}/${GOLDEN_CASES.length} = ${accuracy.toFixed(1)}%`);

  if (accuracy < 70) {
    console.error("\nWARN: accuracy below 70% threshold");
    process.exit(1);
  }
}

runEval().catch((err) => {
  console.error("Eval failed:", err);
  process.exit(1);
});
