// Entry point — wires everything together

import { llm } from './llm.js';
import { createGameState } from './game.js';
import { generateRoom } from './generator.js';
import { UI } from './ui.js';

const isMock = new URLSearchParams(window.location.search).get('mock') === 'true';
const isAutoplay = new URLSearchParams(window.location.search).get('autoplay') === 'true';

async function boot() {
  const $progress = document.getElementById('progress-bar');
  const $progressText = document.getElementById('progress-text');
  const $startSection = document.getElementById('start-section');
  const $gameSection = document.getElementById('game-section');
  const $modelBadge = document.getElementById('model-badge');

  if ($modelBadge) {
    $modelBadge.textContent = isMock ? 'MOCK MODE' : 'SmolLM2-360M';
  }

  function updateProgress(frac, text) {
    if ($progress) $progress.style.width = `${Math.round(frac * 100)}%`;
    if ($progressText) $progressText.textContent = text || '';
  }

  updateProgress(0, isMock ? 'Initialising mock engine...' : 'Loading SmolLM2-360M (~200 MB)...');

  try {
    await llm.init(updateProgress);
  } catch (err) {
    document.getElementById('webgpu-error').style.display = 'block';
    document.getElementById('webgpu-error').textContent = `⚠ ${err.message}`;
    return;
  }

  updateProgress(1, 'Ready!');
  await new Promise(r => setTimeout(r, 400));

  // Init game
  const state = createGameState();

  // Pre-generate first room north
  await generateRoom(state, state.currentRoom, 'north');

  if ($startSection) $startSection.style.display = 'none';
  if ($gameSection) $gameSection.style.display = 'grid';

  const ui = new UI(state);
  ui.addLog('The dungeon awaits...');
  ui.render();

  if (isAutoplay) {
    runAutoplayMode(state, ui);
  }
}

async function runAutoplayMode(state, ui) {
  const { runAutoplay } = await import('./autoplay.js');
  ui.addLog('[AUTOPLAY MODE]');
  const result = await runAutoplay({
    maxTurns: 30,
    onTurn: ({ turn }) => {
      ui.render();
      ui.addLog(`[Auto] Turn ${turn + 1}`);
    },
  });
  ui.render();
  ui.addLog(`[AUTOPLAY DONE] Rooms: ${result.roomsGenerated}, Coherence: ${result.coherenceScore.toFixed(2)}, Fallback: ${(result.parseFallbackRate * 100).toFixed(0)}%`);
  console.log('Autoplay result:', result);
}

boot().catch(err => {
  console.error('Boot failed:', err);
  const el = document.getElementById('webgpu-error');
  if (el) {
    el.style.display = 'block';
    el.textContent = `Boot error: ${err.message}`;
  }
});
