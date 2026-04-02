// Game state and data model

export const DIRECTIONS = ['north', 'south', 'east', 'west'];

export const OPPOSITE = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

export const DIR_DELTA = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

let roomCounter = 0;

export function createRoom(type = 'chamber', coords = { x: 0, y: 0 }) {
  return {
    id: `room_${String(++roomCounter).padStart(3, '0')}`,
    type,
    description: '',
    encounter: null,
    doors: { north: null, south: null, east: null, west: null },
    visited: false,
    coords,
  };
}

export function createGameState() {
  roomCounter = 0;
  const entrance = createRoom('entrance', { x: 0, y: 0 });
  entrance.description = 'A heavy stone door marks the dungeon entrance. Torches flicker in iron sconces.';
  entrance.visited = true;

  // Entrance always has at least one door north
  entrance.doors.north = 'pending';

  const rooms = new Map();
  rooms.set(entrance.id, entrance);

  return {
    rooms,
    currentRoom: entrance.id,
    player: { hp: 10, maxHp: 10, gold: 0, items: [] },
    log: ['You descend into the dungeon...'],
    turnCount: 0,
    metrics: {
      roomsGenerated: 0,
      encountersCompleted: 0,
      parseFailures: 0,
      totalGenerationMs: 0,
      generationCount: 0,
    },
  };
}

export function getCurrentRoom(state) {
  return state.rooms.get(state.currentRoom);
}

export function movePlayer(state, direction) {
  const room = getCurrentRoom(state);
  const targetId = room.doors[direction];
  if (!targetId || targetId === 'pending') return false;

  state.currentRoom = targetId;
  state.rooms.get(targetId).visited = true;
  state.turnCount++;
  return true;
}

export function resolveEncounter(state, choiceIndex) {
  const room = getCurrentRoom(state);
  if (!room.encounter || room.encounter.resolved) return null;

  const outcome = room.encounter.outcomes[choiceIndex];
  if (!outcome) return null;

  // Apply simple state effects from outcome text
  if (outcome.toLowerCase().includes('lose') && outcome.match(/(\d+)\s*hp/i)) {
    const dmg = parseInt(outcome.match(/(\d+)\s*hp/i)[1]);
    state.player.hp = Math.max(0, state.player.hp - dmg);
  }
  if (outcome.toLowerCase().includes('gold') || outcome.toLowerCase().includes('coin')) {
    state.player.gold += 1 + Math.floor(Math.random() * 3);
  }
  if (outcome.match(/\+\s*(\d+)\s*hp/i)) {
    const heal = parseInt(outcome.match(/\+\s*(\d+)\s*hp/i)[1]);
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
  }

  room.encounter.resolved = true;
  room.encounter.chosenIndex = choiceIndex;
  room.encounter.outcomeText = outcome;
  state.turnCount++;
  state.metrics.encountersCompleted++;
  return outcome;
}
