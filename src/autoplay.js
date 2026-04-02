// Autonomous player bot

import { llm } from './llm.js';
import { AUTOPLAY_PROMPT } from './prompts.js';
import { createGameState, getCurrentRoom, movePlayer, resolveEncounter, DIRECTIONS } from './game.js';
import { generateRoom } from './generator.js';
import { collectMetrics } from './metrics.js';

const MAX_TURNS = 30;

function parseLLMChoice(text, numChoices) {
  const match = text.match(/\b([1-9])\b/);
  if (match) {
    const n = parseInt(match[1]);
    if (n >= 1 && n <= numChoices) return n - 1;
  }
  return Math.floor(Math.random() * numChoices);
}

function getUnexploredDoors(state) {
  const room = getCurrentRoom(state);
  return DIRECTIONS.filter(d => room.doors[d] === 'pending');
}

function getAvailableDoors(state) {
  const room = getCurrentRoom(state);
  return DIRECTIONS.filter(d => room.doors[d] && room.doors[d] !== 'pending');
}

export async function runAutoplay({ maxTurns = MAX_TURNS, onTurn } = {}) {
  const state = createGameState();
  let playerSurvived = true;
  let crashed = false;

  try {
    for (let turn = 0; turn < maxTurns && state.player.hp > 0; turn++) {
      const room = getCurrentRoom(state);

      // Resolve encounter first if pending
      if (room.encounter && !room.encounter.resolved) {
        let choiceIndex = 0;
        try {
          const prompt = AUTOPLAY_PROMPT(room.description, room.encounter.text, room.encounter.choices);
          const response = await llm.generateWithChoice(prompt, 10);
          choiceIndex = parseLLMChoice(response, room.encounter.choices.length);
        } catch {
          choiceIndex = Math.floor(Math.random() * room.encounter.choices.length);
        }
        resolveEncounter(state, choiceIndex);
      }

      // Pick a door — prefer unexplored
      let door;
      const unexplored = getUnexploredDoors(state);
      const available = getAvailableDoors(state);

      if (unexplored.length > 0) {
        door = unexplored[0];
        // Generate the room
        await generateRoom(state, state.currentRoom, door);
      } else if (available.length > 0) {
        door = available[Math.floor(Math.random() * available.length)];
      } else {
        break; // No doors — shouldn't happen
      }

      movePlayer(state, door);

      onTurn && onTurn({ state, turn });
    }
  } catch (err) {
    console.error('Autoplay crash:', err);
    crashed = true;
  }

  if (state.player.hp <= 0) playerSurvived = false;

  return collectMetrics(state, { playerSurvived, crashed });
}
