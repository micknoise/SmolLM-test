#!/usr/bin/env node
// Phase 4 autoplay harness — runs N sessions, aggregates metrics, asserts pass/fail

process.env.MOCK_LLM = 'true';

import assert from 'node:assert/strict';
import { runAutoplay } from '../src/autoplay.js';
import { aggregateMetrics } from '../src/metrics.js';

const args = process.argv.slice(2);
const runsArg = args.find(a => a.startsWith('--runs='));
const N = runsArg ? parseInt(runsArg.split('=')[1]) : 5;
const maxTurnsArg = args.find(a => a.startsWith('--maxTurns='));
const MAX_TURNS = maxTurnsArg ? parseInt(maxTurnsArg.split('=')[1]) : 30;

async function main() {
  console.log(`\n=== Phase 4: Autoplay Harness (${N} runs × ${MAX_TURNS} turns) ===\n`);

  const results = [];
  for (let i = 0; i < N; i++) {
    process.stdout.write(`  Run ${i + 1}/${N}...`);
    const r = await runAutoplay({ maxTurns: MAX_TURNS });
    results.push(r);
    process.stdout.write(` rooms=${r.roomsGenerated} coherence=${r.coherenceScore.toFixed(2)} fallback=${(r.parseFallbackRate * 100).toFixed(0)}% ${r.crashed ? '💥CRASH' : '✓'}\n`);
  }

  const summary = aggregateMetrics(results);

  console.log('\n--- Summary ---');
  console.log(JSON.stringify(summary, null, 2));

  // PASS/FAIL assertions
  let allPass = true;

  function check(condition, msg) {
    if (!condition) {
      console.error(`\n  FAIL: ${msg}`);
      allPass = false;
    } else {
      console.log(`  PASS: ${msg}`);
    }
  }

  check(
    summary.avgParseFallbackRate < 0.3,
    `LLM parse success rate: fallbackRate=${(summary.avgParseFallbackRate * 100).toFixed(1)}% (threshold <30%)`
  );
  check(
    summary.avgCoherenceScore > 0.5,
    `Room coherence: ${summary.avgCoherenceScore.toFixed(3)} (threshold >0.5)`
  );
  check(
    summary.crashCount === 0,
    `Zero crashes: ${summary.crashCount} crashes across ${N} runs`
  );
  check(
    summary.avgRoomsGenerated >= 3,
    `Rooms generated: avg=${summary.avgRoomsGenerated.toFixed(1)} (threshold ≥3)`
  );

  console.log('');

  if (!allPass) {
    process.exit(1);
  }

  console.log('All assertions passed.\n');
}

main().catch(err => {
  console.error('Harness error:', err);
  process.exit(1);
});
