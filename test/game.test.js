#!/usr/bin/env node
// Phase 2 unit tests — game state + generator + renderer

process.env.MOCK_LLM = 'true';

import assert from 'node:assert/strict';
import { createGameState, getCurrentRoom, movePlayer, resolveEncounter, DIRECTIONS } from '../src/game.js';
import { generateRoom } from '../src/generator.js';
import { renderMapString } from '../src/renderer.js';

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
}

async function run() {
  console.log('\n=== Phase 2: Game Engine Tests ===\n');

  await test('createGameState returns valid state', () => {
    const state = createGameState();
    assert.ok(state.rooms instanceof Map);
    assert.ok(state.rooms.size === 1);
    assert.ok(state.currentRoom);
    assert.equal(state.player.hp, 10);
    assert.equal(state.turnCount, 0);
  });

  await test('entrance room is visited with north door pending', () => {
    const state = createGameState();
    const entrance = getCurrentRoom(state);
    assert.equal(entrance.visited, true);
    assert.equal(entrance.doors.north, 'pending');
    assert.equal(entrance.type, 'entrance');
  });

  await test('generate 5 rooms using mock LLM', async () => {
    const state = createGameState();
    for (let i = 0; i < 5; i++) {
      const room = getCurrentRoom(state);
      const pendingDirs = DIRECTIONS.filter(d => room.doors[d] === 'pending');
      const dir = pendingDirs[0] || 'north';
      if (room.doors[dir] === undefined) room.doors[dir] = 'pending';
      await generateRoom(state, state.currentRoom, dir);
      if (room.doors[dir] && room.doors[dir] !== 'pending') {
        movePlayer(state, dir);
      }
    }
    assert.ok(state.rooms.size >= 4, `Expected ≥4 rooms, got ${state.rooms.size}`);
    assert.equal(state.metrics.roomsGenerated, 5);
  });

  await test('map connectivity — BFS from entrance reaches all visited rooms', async () => {
    const state = createGameState();
    // Generate a small network
    const dirs = ['north', 'east', 'south', 'west', 'north'];
    for (const dir of dirs) {
      const room = getCurrentRoom(state);
      if (!room.doors[dir]) room.doors[dir] = 'pending';
      if (room.doors[dir] === 'pending') {
        await generateRoom(state, state.currentRoom, dir);
      }
      if (room.doors[dir] && room.doors[dir] !== 'pending') {
        movePlayer(state, dir);
      }
    }

    // BFS
    const visited = new Set();
    const queue = [state.rooms.keys().next().value];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const room = state.rooms.get(id);
      for (const dir of DIRECTIONS) {
        const next = room.doors[dir];
        if (next && next !== 'pending' && !visited.has(next)) {
          queue.push(next);
        }
      }
    }
    assert.equal(visited.size, state.rooms.size, `BFS reached ${visited.size}/${state.rooms.size} rooms`);
  });

  await test('ASCII renderer produces non-empty output', async () => {
    const state = createGameState();
    await generateRoom(state, state.currentRoom, 'north');
    const output = renderMapString(state);
    assert.ok(output.length > 0);
    assert.ok(output.includes('@'), 'Map should contain player @');
    assert.ok(output.includes('┌'), 'Map should contain box drawing chars');
  });

  await test('encounter structure is valid', async () => {
    const state = createGameState();
    const newRoom = await generateRoom(state, state.currentRoom, 'north');
    assert.ok(newRoom.encounter, 'Room should have encounter');
    assert.ok(newRoom.encounter.text, 'Encounter should have text');
    assert.ok(Array.isArray(newRoom.encounter.choices), 'Choices should be array');
    assert.ok(newRoom.encounter.choices.length >= 2, 'Should have ≥2 choices');
    assert.ok(Array.isArray(newRoom.encounter.outcomes), 'Outcomes should be array');
    assert.equal(newRoom.encounter.resolved, false);
  });

  await test('resolveEncounter updates state correctly', async () => {
    const state = createGameState();
    await generateRoom(state, state.currentRoom, 'north');
    movePlayer(state, 'north');
    const room = getCurrentRoom(state);
    const outcome = resolveEncounter(state, 0);
    assert.ok(outcome, 'Should return outcome text');
    assert.equal(room.encounter.resolved, true);
    assert.equal(room.encounter.chosenIndex, 0);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
