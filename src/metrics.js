// Metrics collection and aggregation

function levenshteinSimilarity(a, b) {
  if (!a || !b) return 0;
  const la = a.toLowerCase(), lb = b.toLowerCase();
  if (la === lb) return 1;
  const m = la.length, n = lb.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = la[i - 1] === lb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

export function computeCoherenceScore(state) {
  let totalScore = 0;
  let count = 0;
  const descriptions = [];

  for (const [, room] of state.rooms) {
    if (!room.description) continue;
    let score = 0;

    if (room.description.length > 20) score++;
    if (room.encounter && room.encounter.text && room.encounter.text.length > 20) score++;

    if (room.encounter && room.encounter.outcomes) {
      const outcomes = room.encounter.outcomes.filter(Boolean);
      const unique = new Set(outcomes.map(o => o.trim().toLowerCase()));
      if (unique.size === outcomes.length && outcomes.length >= 2) score++;
    }

    // Uniqueness vs previous descriptions
    let uniqueVsPrev = true;
    for (const prev of descriptions) {
      if (levenshteinSimilarity(room.description, prev) > 0.5) {
        uniqueVsPrev = false;
        break;
      }
    }
    if (uniqueVsPrev) score++;

    descriptions.push(room.description);
    totalScore += score / 4;
    count++;
  }

  return count > 0 ? totalScore / count : 0;
}

export function collectMetrics(state, { playerSurvived = true, crashed = false } = {}) {
  const m = state.metrics;
  const avgGenMs = m.generationCount > 0 ? m.totalGenerationMs / m.generationCount : 0;
  const parseFallbackRate = m.roomsGenerated > 0 ? m.parseFailures / m.roomsGenerated : 0;

  return {
    totalTurns: state.turnCount,
    roomsGenerated: m.roomsGenerated,
    encountersCompleted: m.encountersCompleted,
    parseFailures: m.parseFailures,
    parseFallbackRate,
    avgGenerationTimeMs: Math.round(avgGenMs),
    playerSurvived,
    goldCollected: state.player.gold,
    coherenceScore: computeCoherenceScore(state),
    crashed,
  };
}

export function aggregateMetrics(results) {
  const n = results.length;
  if (n === 0) return {};

  const sum = (key) => results.reduce((acc, r) => acc + (r[key] || 0), 0);
  const avg = (key) => sum(key) / n;

  return {
    runs: n,
    avgTotalTurns: avg('totalTurns'),
    avgRoomsGenerated: avg('roomsGenerated'),
    avgEncountersCompleted: avg('encountersCompleted'),
    avgParseFailures: avg('parseFailures'),
    avgParseFallbackRate: avg('parseFallbackRate'),
    avgGenerationTimeMs: avg('avgGenerationTimeMs'),
    survivalRate: results.filter(r => r.playerSurvived).length / n,
    avgGoldCollected: avg('goldCollected'),
    avgCoherenceScore: avg('coherenceScore'),
    crashCount: results.filter(r => r.crashed).length,
  };
}
