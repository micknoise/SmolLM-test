// Room / encounter generator — calls LLM, parses response, falls back to templates

import { llm } from './llm.js';
import { ROOM_PROMPT } from './prompts.js';
import { createRoom, DIRECTIONS, OPPOSITE, DIR_DELTA } from './game.js';

const ROOM_TYPES = ['chamber', 'vault', 'crypt', 'library', 'shrine', 'corridor', 'pit', 'forge'];
const THEMES = ['undead', 'arcane', 'fungal', 'flooded', 'ancient', 'demonic', 'frozen', 'volcanic'];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseRoomResponse(text) {
  const get = (key) => {
    const m = text.match(new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Z]+:|$)`, 's'));
    return m ? m[1].trim() : null;
  };

  const description = get('ROOM');
  const encounter = get('ENCOUNTER');
  const choicesRaw = get('CHOICES');
  const outcome1 = get('OUTCOME1');
  const outcome2 = get('OUTCOME2');
  const outcome3 = get('OUTCOME3');

  if (!description || !encounter || !choicesRaw) return null;

  const choices = choicesRaw.split('|').map(c => c.trim()).filter(Boolean);
  if (choices.length < 2) return null;

  const outcomes = [outcome1, outcome2, outcome3]
    .map(o => o || 'Nothing happens.')
    .slice(0, choices.length);

  return { description, encounter, choices, outcomes };
}

function parseXmlRoomResponse(text) {
  const get = (tag) => {
    const m = text.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1].trim() : null;
  };

  const description = get('description');
  const encounter = get('encounter');

  const choiceMatches = [...text.matchAll(/<choice[^>]*>([\s\S]*?)<\/choice>/gi)];
  const outcomeMatches = [...text.matchAll(/<outcome[^>]*>([\s\S]*?)<\/outcome>/gi)];

  if (!description || !encounter || choiceMatches.length < 2) return null;

  const choices = choiceMatches.map(m => m[1].trim());
  const outcomes = outcomeMatches.map(m => m[1].trim());
  while (outcomes.length < choices.length) outcomes.push('Nothing happens.');

  return { description, encounter, choices, outcomes };
}

// Fallback template pools
const FALLBACK_ROOMS = [
  {
    description: "A musty crypt lined with stone sarcophagi, cobwebs thick between the pillars.",
    encounter: "A zombie lurches out from behind the nearest coffin.",
    choices: ["Fight it", "Flee", "Shove coffin at it"],
    outcomes: ["You dispatch it with effort, earning 2 gold from its rotted purse.", "You retreat safely through the door you came in.", "The zombie is pinned briefly — you dash past."]
  },
  {
    description: "A vaulted armory stripped bare, only rusted hooks remaining on the walls.",
    encounter: "A ghost sergeant demands you prove your worth.",
    choices: ["Recite a battle oath", "Challenge it to combat", "Ignore it"],
    outcomes: ["Impressed, it gifts you a spectral sword (+1 to next fight).", "It phases through your attack and chills you for 1 HP.", "It wails but you walk on unharmed."]
  },
  {
    description: "A circular ritual chamber, a pentagram scorched into the stone floor.",
    encounter: "Cultist symbols glow ominously. A trapped imp shrieks from a cage.",
    choices: ["Free the imp", "Smash the symbols", "Take the cage"],
    outcomes: ["The grateful imp reveals a secret passage north.", "The symbols shatter — you gain 1 gold from the scattered offerings.", "The imp offers dubious advice in exchange for its freedom."]
  },
  {
    description: "An abandoned alchemist's lab, vials smashed on the floor, fumes still rising.",
    encounter: "A bubbling cauldron hisses and spits — something moves inside.",
    choices: ["Stir the cauldron", "Overturn it", "Drink a nearby vial"],
    outcomes: ["A homunculus emerges and bows — it will scout one room for you.", "The mess covers the floor; you slip but escape.", "The mystery brew restores 2 HP — lucky!"]
  },
  {
    description: "A long gallery of defaced portraits, the eyes cut from every canvas.",
    encounter: "One frame is empty. A disembodied voice asks what you seek.",
    choices: ["Say 'treasure'", "Say 'knowledge'", "Stay silent"],
    outcomes: ["A loose stone reveals 3 gold coins.", "A hidden journal drops from a shelf — a clue to a deeper room.", "The voice sighs and fades, leaving an uneasy silence."]
  },
];

let fallbackIndex = 0;

function getFallbackRoom() {
  return FALLBACK_ROOMS[fallbackIndex++ % FALLBACK_ROOMS.length];
}

export async function generateRoom(state, fromRoomId, direction) {
  const fromRoom = state.rooms.get(fromRoomId);
  const newCoords = {
    x: fromRoom.coords.x + DIR_DELTA[direction].x,
    y: fromRoom.coords.y + DIR_DELTA[direction].y,
  };

  // Check if any existing room sits at these coords
  for (const [, room] of state.rooms) {
    if (room.coords.x === newCoords.x && room.coords.y === newCoords.y) {
      // Link rooms
      fromRoom.doors[direction] = room.id;
      room.doors[OPPOSITE[direction]] = fromRoomId;
      return room;
    }
  }

  const roomType = pickRandom(ROOM_TYPES);
  const theme = pickRandom(THEMES);
  const newRoom = createRoom(roomType, newCoords);

  // Determine extra doors (1-2 additional beyond the one coming in)
  const extraDoors = Math.floor(Math.random() * 2) + 1;
  const availableDirs = DIRECTIONS.filter(d => d !== OPPOSITE[direction]);
  const chosenDirs = availableDirs.sort(() => Math.random() - 0.5).slice(0, extraDoors);
  chosenDirs.forEach(d => { newRoom.doors[d] = 'pending'; });

  // Link entry direction
  newRoom.doors[OPPOSITE[direction]] = fromRoomId;
  fromRoom.doors[direction] = newRoom.id;

  // Generate content via LLM
  const t0 = Date.now();
  let parsed = null;

  try {
    const prompt = ROOM_PROMPT({ roomType, theme });
    const raw = await llm.generate(prompt, 220);

    parsed = parseRoomResponse(raw) || parseXmlRoomResponse(raw);
  } catch (err) {
    console.warn('LLM generation error:', err);
  }

  const genMs = Date.now() - t0;
  state.metrics.totalGenerationMs += genMs;
  state.metrics.generationCount++;

  if (!parsed) {
    state.metrics.parseFailures++;
    parsed = getFallbackRoom();
  }

  newRoom.description = parsed.description;
  newRoom.encounter = {
    text: parsed.encounter,
    choices: parsed.choices,
    outcomes: parsed.outcomes,
    resolved: false,
    chosenIndex: null,
    outcomeText: null,
  };

  state.rooms.set(newRoom.id, newRoom);
  state.metrics.roomsGenerated++;

  return newRoom;
}
