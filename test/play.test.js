#!/usr/bin/env node
// Phase 3 integration test — simulate 10 turns programmatically

process.env.MOCK_LLM = 'true';

import assert from 'node:assert/strict';
import { createGameState, getCurrentRoom, movePlayer, resolveEncounter, DIRECTIONS } from '../src/game.js';
import { generateRoom } from '../src/generator.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch(err => {
        console.error(`  ✗ ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

async function simulateTurns(state, numTurns) {
  for (let i = 0; i < numTurns; i++) {
    const room = getCurrentRoom(state);

    // Resolve encounter if any
    if (room.encounter && !room.encounter.resolved) {
      const choiceIdx = Math.floor(Math.random() * room.encounter.choices.length);
      resolveEncounter(state, choiceIdx);
    }

    // Pick a random action: unexplored doors first, then explored
    const unexplored = DIRECTIONS.filter(d => room.doors[d] === 'pending');
    const explored = DIRECTIONS.filter(d => room.doors[d] && room.doors[d] !== 'pending');

    if (unexplored.length > 0) {
      const dir = unexplored[Math.floor(Math.random() * unexplored.length)];
      await generateRoom(state, state.currentRoom, dir);
      movePlayer(state, dir);
    } else if (explored.length > 0) {
      const dir = explored[Math.floor(Math.random() * explored.length)];
      movePlayer(state, dir);
    }
  }
}

async function run() {
  console.log('\n=== Phase 3: Play Loop Tests ===\n');

  await test('simulate 10 turns without crash', async () => {
    const state = createGameState();
    await simulateTurns(state, 10);
    assert.ok(state.turnCount > 0, 'Should have taken turns');
  });

  await test('≥3 rooms generated after 10 turns', async () => {
    const state = createGameState();
    await simulateTurns(state, 10);
    assert.ok(state.metrics.roomsGenerated >= 3, `Expected ≥3 rooms, got ${state.metrics.roomsGenerated}`);
  });

  await test('game state consistency — rooms linked bidirectionally', async () => {
    const state = createGameState();
    await simulateTurns(state, 10);

    for (const [id, room] of state.rooms) {
      for (const dir of DIRECTIONS) {
        const targetId = room.doors[dir];
        if (!targetId || targetId === 'pending') continue;
        const target = state.rooms.get(targetId);
        assert.ok(target, `Room ${id} door ${dir} points to non-existent room ${targetId}`);
        // Bidirectional check
        const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' }[dir];
        assert.ok(
          target.doors[opposite] === id || target.doors[opposite] === 'pending',
          `Room ${targetId} should have door back to ${id}`
        );
      }
    }
  });

  await test('player HP stays in valid range', async () => {
    const state = createGameState();
    await simulateTurns(state, 10);
    assert.ok(state.player.hp >= 0, 'HP should not go negative');
    assert.ok(state.player.hp <= state.player.maxHp, 'HP should not exceed maxHp');
  });

  await test('metrics are tracked correctly', async () => {
    const state = createGameState();
    await simulateTurns(state, 10);
    assert.ok(state.metrics.roomsGenerated >= 0);
    assert.ok(state.metrics.encountersCompleted >= 0);
    assert.ok(state.metrics.parseFailures >= 0);
    assert.ok(state.metrics.parseFailures <= state.metrics.roomsGenerated);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
