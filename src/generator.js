// Room / encounter generator — LLM provides descriptions only;
// choices and outcomes come from curated pools keyed by encounter archetype.

import { llm } from './llm.js';
import { ROOM_PROMPT } from './prompts.js';
import { createRoom, DIRECTIONS, OPPOSITE, DIR_DELTA } from './game.js';

const ROOM_TYPES = ['chamber', 'vault', 'crypt', 'library', 'shrine', 'corridor', 'pit', 'forge'];
const THEMES = ['undead', 'arcane', 'fungal', 'flooded', 'ancient', 'demonic', 'frozen', 'volcanic'];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Encounter archetypes (choices + outcomes only — no descriptions) ─────────
// Each archetype has multiple choice/outcome sets so variety stays high.

const ARCHETYPES = [
  {
    keywords: ['skeleton', 'zombie', 'bone', 'undead', 'corpse', 'ghoul', 'lich', 'wraith', 'ghost', 'specter'],
    sets: [
      { choices: ['Strike at it', 'Back away', 'Smash its source'],       outcomes: ['You shatter it — 2 gold fall from its remains.', 'It drifts after you; you take 1 HP damage.', 'The animating relic crumbles; it collapses instantly.'] },
      { choices: ['Fight through', 'Speak to it', 'Turn and run'],         outcomes: ['Hard won — 1 HP damage but you press on.', 'It pauses, confused, then lets you past.', 'It doesn\'t pursue beyond its chamber.'] },
      { choices: ['Use holy symbol', 'Dodge past', 'Collapse the doorway'], outcomes: ['It recoils and dissolves into ash.', 'You slip by — heart hammering.', 'Rubble buys you enough time to escape.'] },
    ],
  },
  {
    keywords: ['spider', 'rat', 'bat', 'serpent', 'snake', 'beast', 'wolf', 'bug', 'insect', 'vermin', 'creature', 'animal'],
    sets: [
      { choices: ['Attack it', 'Offer food', 'Make noise to scare it'],    outcomes: ['It flees wounded — you find its nest cache: 1 gold.', 'It takes the morsel and backs off.', 'It skitters into a crack in the wall.'] },
      { choices: ['Strike first', 'Back slowly', 'Throw something'],       outcomes: ['A clean hit — it retreats.', 'You reach the door unmolested.', 'Distracted, it lets you slip past.'] },
    ],
  },
  {
    keywords: ['goblin', 'bandit', 'cultist', 'guard', 'soldier', 'knight', 'thief', 'warrior', 'human', 'orc', 'troll'],
    sets: [
      { choices: ['Draw your weapon', 'Negotiate', 'Bluff your way through'], outcomes: ['They back down — outnumbered in their mind.', 'They demand 2 gold; you pay and pass.', 'Your confidence convinces them; they step aside.'] },
      { choices: ['Charge', 'Offer a trade', 'Pretend to be lost'],         outcomes: ['They scatter — you lose 1 HP in the scuffle.', 'They accept and share a useful rumour.', 'Embarrassed, they wave you through.'] },
    ],
  },
  {
    keywords: ['flame', 'fire', 'lava', 'heat', 'torch', 'burn', 'ember', 'forge', 'furnace', 'elemental'],
    sets: [
      { choices: ['Dash through the flames', 'Find a way around', 'Douse them'],  outcomes: ['Singed but through — 1 HP damage.', 'A ledge path avoids the worst.', 'Steam fills the room; you cross safely.'] },
      { choices: ['Use a cloak as shield', 'Roll under the fire', 'Wait it out'], outcomes: ['The cloak smoulders but holds.', 'You emerge on the far side unburnt.', 'The flames gutter low enough to pass.'] },
    ],
  },
  {
    keywords: ['flood', 'water', 'pool', 'lake', 'cistern', 'rain', 'damp', 'wet', 'river', 'stream'],
    sets: [
      { choices: ['Swim across', 'Step stone to stone', 'Drain the room'],        outcomes: ['Cold but across — you check your pack for damage.', 'You make it dry-footed.', 'The drain takes time; something stirs then settles.'] },
      { choices: ['Find a rope', 'Wade carefully', 'Look for a bridge'],          outcomes: ['A rope on the wall — you swing across easily.', 'Knee-deep and eerie, but passable.', 'A plank across two pillars holds your weight.'] },
    ],
  },
  {
    keywords: ['trap', 'pressure', 'dart', 'spike', 'pit', 'wire', 'alarm', 'rune', 'glyph', 'curse'],
    sets: [
      { choices: ['Disarm it', 'Trigger it deliberately', 'Find another route'], outcomes: ['A careful hand — the mechanism clicks silent.', 'The darts fly wide; you hug the wall.', 'A longer path but unscathed.'] },
      { choices: ['Jump over', 'Probe ahead with a stick', 'Crawl low'],         outcomes: ['You clear it cleanly.', 'The stick triggers it harmlessly ahead of you.', 'Below the pressure plates — you crawl through.'] },
    ],
  },
  {
    keywords: ['golem', 'construct', 'machine', 'clockwork', 'automaton', 'mechanical'],
    sets: [
      { choices: ['Smash the control gem', 'Jam its gears', 'Outrun it'],         outcomes: ['It judders and stops mid-stride.', 'A broken blade holds long enough for you to escape.', 'Too slow — it grinds to a halt at the doorway.'] },
    ],
  },
  {
    keywords: ['mimic', 'slime', 'ooze', 'mold', 'mushroom', 'fungus', 'spore'],
    sets: [
      { choices: ['Burn it', 'Poke it from a distance', 'Ignore it and sprint'],  outcomes: ['It shrivels and retreats.', 'Your weapon comes back coated but you\'re unharmed.', 'It lunges — 1 HP — but the door slams behind you.'] },
    ],
  },
];

// Generic fallback archetype (no keyword match)
const GENERIC_ARCHETYPE = {
  sets: [
    { choices: ['Confront it', 'Sneak past', 'Find another way'],  outcomes: ['You push through — 1 HP damage.', 'You slip by unnoticed.', 'A longer route but safe.'] },
    { choices: ['Attack', 'Negotiate', 'Flee'],                    outcomes: ['You prevail but take 1 HP damage.', 'Tense standoff — it lets you past.', 'It doesn\'t follow past the threshold.'] },
    { choices: ['Use an item', 'Charge', 'Back away slowly'],       outcomes: ['Just the right tool — problem solved.', 'Brute force works but costs 1 HP.', 'It doesn\'t pursue.'] },
  ],
};

function pickEncounterSet(encounterText) {
  const lower = (encounterText || '').toLowerCase();
  for (const arch of ARCHETYPES) {
    if (arch.keywords.some(k => lower.includes(k))) {
      return pickRandom(arch.sets);
    }
  }
  return pickRandom(GENERIC_ARCHETYPE.sets);
}

// ─── Description parser (only needs to extract 2 sentences) ──────────────────

function extractTwoSentences(text) {
  if (!text || text.length < 15) return null;

  // Strip common preamble patterns ("Sure!", "Here is...", "Certainly,")
  const cleaned = text
    .replace(/^(sure[!,.]?\s*|here (is|are)[^:]*:\s*|certainly[!,.]?\s*|of course[!,.]?\s*)/i, '')
    .replace(/^["']/, '')
    .trim();

  // Split on sentence boundaries
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/^["']|["']$/g, '').trim())
    .filter(s => s.length > 10 && /[a-zA-Z]/.test(s));

  if (sentences.length === 0) return null;

  const description = sentences[0];
  // Second sentence for the threat; fall back to rephrasing if only one sentence
  const threat = sentences[1] || sentences[0];

  return { description, threat };
}

// ─── Fallback descriptions (random) ──────────────────────────────────────────

const FALLBACK_DESCRIPTIONS = [
  { description: "A musty crypt lined with stone sarcophagi, cobwebs thick between the pillars.", threat: "A zombie lurches out from behind the nearest coffin." },
  { description: "A flooded antechamber knee-deep in black water, strange lights flickering below the surface.", threat: "Something large and pale circles just beneath the surface." },
  { description: "A vast circular library, shelves reaching into darkness, books chained to their posts.", threat: "A robed lich stands at the central lectern, eyes fixed on you." },
  { description: "A narrow corridor carved through living rock, the ceiling weeping mineral water.", threat: "A giant spider descends from above on a glistening thread." },
  { description: "A treasure vault long since looted, empty pedestals gathering dust.", threat: "A mimic lurks among the empty chests, perfectly still." },
  { description: "A shrine to a forgotten god, candles still burning after centuries.", threat: "A spectral priest demands tribute or threatens a curse." },
  { description: "A forge still glowing with hellish heat, weapons half-finished on the anvil.", threat: "A fire elemental coils around the central furnace, watching." },
  { description: "A collapsed throne room, a cracked crown resting on a rubble mound.", threat: "The ghost of the dethroned king demands you kneel before him." },
  { description: "A garden gone wild underground, bioluminescent mushrooms lighting the way.", threat: "Spores burst from a bloated fungus blocking the central path." },
  { description: "A guard post with a still-lit lantern — someone was here very recently.", threat: "A bandit who took a wrong turn is as surprised to see you as you are." },
  { description: "A cathedral-scale cavern whose ceiling disappears into darkness far above.", threat: "A giant bat colony stirs as you enter, thousands of eyes blinking open." },
  { description: "A clockwork room whose gears turn endlessly, their purpose long forgotten.", threat: "A mechanical guardian rolls forward, grinding gears ominously." },
  { description: "A prison corridor with rusted cells, most empty, one with a faint scratching sound.", threat: "An imprisoned shadow demon rattles the bars of a cracked cell." },
  { description: "A mirror gallery where your reflection moves a half-second behind.", threat: "One reflection steps fully out of its mirror and advances toward you." },
  { description: "A wine cellar with mostly smashed bottles and one very drunk sleeping goblin.", threat: "The goblin stirs, snorts, and reaches blearily for a shiv." },
  { description: "An observatory with a cracked glass dome, real stars visible through the gap.", threat: "A ghostly astronomer blocks the telescope, muttering frantic calculations." },
  { description: "A map room with charts of the dungeon pinned to every wall.", threat: "A cartographer's ghost demands you correct an error before you leave." },
  { description: "A meditation chamber, incense still smouldering in ancient stone burners.", threat: "A stone golem sits cross-legged, eyes tracking your every move." },
  { description: "A butcher's room with cleavers hanging in neat rows, all recently cleaned.", threat: "A figure in a bloody apron steps out of the shadows ahead." },
  { description: "A nursery of dusty cradles, a single music box still playing a faint tune.", threat: "A protective wraith forms the moment you reach for the music box." },
  { description: "A long gallery of defaced portraits, the eyes carefully cut from every canvas.", threat: "A disembodied voice demands you state your purpose or face the dark." },
  { description: "A circular ritual chamber, a pentagram scorched deep into the stone floor.", threat: "Cultist symbols glow ominously as a trapped imp shrieks from its cage." },
  { description: "An abandoned alchemist's lab, vials smashed on the floor, fumes still rising.", threat: "A bubbling cauldron hisses and spits — something moves inside it." },
  { description: "A vaulted armoury stripped bare, only rusted hooks remaining on the walls.", threat: "A ghost sergeant blocks your path, demanding you prove your worth." },
  { description: "A trophy room with mounted heads of creatures you have never seen before.", threat: "One of the mounted creatures — still living, somehow — snaps at you." },
];

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateRoom(state, fromRoomId, direction) {
  const fromRoom = state.rooms.get(fromRoomId);
  const newCoords = {
    x: fromRoom.coords.x + DIR_DELTA[direction].x,
    y: fromRoom.coords.y + DIR_DELTA[direction].y,
  };

  // Re-use existing room at same coords (loop detection)
  for (const [, room] of state.rooms) {
    if (room.coords.x === newCoords.x && room.coords.y === newCoords.y) {
      fromRoom.doors[direction] = room.id;
      room.doors[OPPOSITE[direction]] = fromRoomId;
      return room;
    }
  }

  const roomType = pickRandom(ROOM_TYPES);
  const theme = pickRandom(THEMES);
  const newRoom = createRoom(roomType, newCoords);

  // Assign pending doors (1–2 extra beyond entry)
  const extraDoors = Math.floor(Math.random() * 2) + 1;
  const availableDirs = DIRECTIONS.filter(d => d !== OPPOSITE[direction]);
  availableDirs.sort(() => Math.random() - 0.5).slice(0, extraDoors).forEach(d => {
    newRoom.doors[d] = 'pending';
  });
  newRoom.doors[OPPOSITE[direction]] = fromRoomId;
  fromRoom.doors[direction] = newRoom.id;

  // ── Ask the LLM for descriptions only ──
  const t0 = Date.now();
  let description = null;
  let threat = null;

  try {
    const prompt = ROOM_PROMPT({ roomType, theme });
    const raw = await llm.generate(prompt, 80); // short — we only need 2 sentences
    const extracted = extractTwoSentences(raw);
    if (extracted) {
      description = extracted.description;
      threat = extracted.threat;
    }
  } catch (err) {
    console.warn('[generator] LLM error:', err);
  }

  state.metrics.totalGenerationMs += Date.now() - t0;
  state.metrics.generationCount++;

  if (!description) {
    state.metrics.parseFailures++;
    const fallback = pickRandom(FALLBACK_DESCRIPTIONS);
    description = fallback.description;
    threat = fallback.threat;
  }

  // ── Pick choices/outcomes from archetype pool keyed on the threat text ──
  const { choices, outcomes } = pickEncounterSet(threat);

  newRoom.description = description;
  newRoom.encounter = { text: threat, choices, outcomes, resolved: false, chosenIndex: null, outcomeText: null };

  state.rooms.set(newRoom.id, newRoom);
  state.metrics.roomsGenerated++;

  return newRoom;
}
