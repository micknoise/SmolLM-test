// Room / encounter generator — calls LLM, parses response, falls back to templates

import { llm } from './llm.js';
import { ROOM_PROMPT } from './prompts.js';
import { createRoom, DIRECTIONS, OPPOSITE, DIR_DELTA } from './game.js';

const ROOM_TYPES = ['chamber', 'vault', 'crypt', 'library', 'shrine', 'corridor', 'pit', 'forge'];
const THEMES = ['undead', 'arcane', 'fungal', 'flooded', 'ancient', 'demonic', 'frozen', 'volcanic'];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

// Strict key: value parser (original format)
function parseKeyValueResponse(text) {
  const get = (key) => {
    const m = text.match(new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Z]+[0-9]*:|$)`, 's'));
    return m ? m[1].trim() : null;
  };

  const description = get('ROOM');
  const encounter = get('ENCOUNTER');
  const choicesRaw = get('CHOICES');
  if (!description || !encounter || !choicesRaw) return null;

  const choices = choicesRaw.split(/\s*\|\s*/).filter(Boolean);
  if (choices.length < 2) return null;

  const outcomes = ['OUTCOME1', 'OUTCOME2', 'OUTCOME3']
    .map(k => get(k) || 'Nothing happens.')
    .slice(0, choices.length);

  return { description, encounter, choices, outcomes };
}

// Fill-in-the-blank parser (V4 prompt format)
function parseFillInResponse(text) {
  const getLine = (key) => {
    const m = text.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
    return m ? m[1].trim() : null;
  };

  const roomLine = getLine('Room');
  const dangerLine = getLine('Danger');
  if (!roomLine || !dangerLine) return null;

  const c1 = getLine('Choice 1') || 'Attack';
  const c2 = getLine('Choice 2') || 'Sneak past';
  const c3 = getLine('Choice 3') || 'Use an item';
  const r1 = getLine('Result 1') || 'You manage to escape.';
  const r2 = getLine('Result 2') || 'You slip past unnoticed.';
  const r3 = getLine('Result 3') || 'The item saves you.';

  return {
    description: roomLine.replace(/^The \w+ is\s*/i, '').trim() || roomLine,
    encounter: dangerLine,
    choices: [c1, c2, c3],
    outcomes: [r1, r2, r3],
  };
}

// Loose parser — tries to extract anything useful from freeform LLM output
function parseLoose(text) {
  if (!text || text.length < 20) return null;

  // Split into sentences
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length < 2) return null;

  const description = sentences[0];
  const encounter = sentences[1] || sentences[0];

  // Try to find numbered or bulleted choices anywhere in the text
  const choiceMatches = [
    ...text.matchAll(/(?:^|\n)\s*(?:\d[.)]\s*|[-*•]\s*)([^\n]{5,60})/gm)
  ].map(m => m[1].trim());

  const choices = choiceMatches.length >= 2
    ? choiceMatches.slice(0, 3)
    : ['Fight', 'Flee', 'Negotiate'];

  const outcomes = choices.map(() => sentences[Math.floor(Math.random() * sentences.length)] || 'Nothing happens.');

  return { description, encounter, choices, outcomes };
}

// ─── Fallback pool (30 rooms, random selection) ───────────────────────────────

const FALLBACK_ROOMS = [
  { description: "A musty crypt lined with stone sarcophagi, cobwebs thick between the pillars.", encounter: "A zombie lurches out from behind the nearest coffin.", choices: ["Smash it", "Flee", "Shove coffin at it"], outcomes: ["You dispatch it, finding 2 gold in its rotted purse.", "You retreat safely through the door.", "The zombie is pinned — you dash past."] },
  { description: "A vaulted armoury stripped bare, only rusted hooks on the walls.", encounter: "A ghost sergeant demands you prove your worth.", choices: ["Recite a battle oath", "Challenge it", "Ignore it"], outcomes: ["Impressed, it gifts you a spectral sword.", "It phases through your swing and chills you for 1 HP.", "It wails but lets you pass."] },
  { description: "A circular ritual chamber, a pentagram scorched into the stone floor.", encounter: "A trapped imp shrieks from an iron cage.", choices: ["Free the imp", "Smash the symbols", "Take the cage"], outcomes: ["The imp reveals a hidden passage.", "The symbols shatter — you gain 1 gold.", "The imp offers to guide you deeper."] },
  { description: "An abandoned alchemist's lab, vials smashed, fumes still rising.", encounter: "A bubbling cauldron hisses — something moves inside.", choices: ["Stir it", "Overturn it", "Drink a vial"], outcomes: ["A homunculus bows and offers to help.", "You slip but escape.", "The brew restores 2 HP — lucky!"] },
  { description: "A long gallery of defaced portraits, eyes cut from every canvas.", encounter: "A disembodied voice asks what you seek.", choices: ["Say 'treasure'", "Say 'knowledge'", "Stay silent"], outcomes: ["A loose stone reveals 3 gold.", "A hidden journal drops — a clue to deeper rooms.", "The voice sighs and fades."] },
  { description: "A flooded antechamber knee-deep in black water, strange lights below.", encounter: "A will-o-wisp bobs toward you, its glow mesmerising.", choices: ["Strike it", "Follow it", "Avert your eyes"], outcomes: ["It drifts away, disinterested.", "It leads you to a cache of silver.", "You stumble but keep your wits."] },
  { description: "A vast circular library, books chained to the shelves.", encounter: "A robed lich stands at the central lectern, eyes fixed on you.", choices: ["Challenge it", "Bow", "Steal a book"], outcomes: ["It blasts you back — you lose 2 HP but reach the exit.", "It nods and grants safe passage.", "The tome explodes in golden light — you gain a scroll."] },
  { description: "A narrow corridor carved through living rock, ceiling weeping mineral water.", encounter: "A giant spider descends on a glistening thread.", choices: ["Cut the thread", "Retreat", "Offer food"], outcomes: ["The spider falls stunned — you dash past.", "You back away and find another route.", "It snatches your ration and scuttles aside."] },
  { description: "A treasure vault long since looted, empty pedestals gathering dust.", encounter: "A mimic lurks among the empty chests, waiting.", choices: ["Open a chest", "Burn the room", "Call out the mimic"], outcomes: ["It springs — 1 HP damage but you find a real gem underneath.", "Smoke fills the room; you escape coughing.", "Surprised, the mimic retreats to a corner."] },
  { description: "A shrine to a forgotten god, candles still burning after centuries.", encounter: "A spectral priest demands tribute or threatens a curse.", choices: ["Pay gold", "Desecrate the shrine", "Recite a prayer"], outcomes: ["You lose 2 gold but receive +2 HP.", "The priest shrieks — your next encounter is harder.", "The priest nods and fades, leaving a relic."] },
  { description: "A forge still glowing with hellish heat, weapons half-finished on the anvil.", encounter: "A fire elemental coils around the central furnace, watching.", choices: ["Grab a weapon", "Douse the furnace", "Back away slowly"], outcomes: ["You snatch a blade — it hums with heat (+1 damage).", "The elemental howls as it shrinks; you escape.", "It loses interest and returns to its flames."] },
  { description: "A collapsed throne room, a cracked crown resting on a rubble mound.", encounter: "The ghost of the dethroned king demands you kneel.", choices: ["Kneel", "Refuse", "Take the crown"], outcomes: ["He blesses you with spectral armour for one room.", "He shrieks and throws phantom rubble — 1 HP damage.", "The crown crumbles to dust in your hands; the ghost weeps and vanishes."] },
  { description: "A garden gone wild underground, bioluminescent mushrooms lighting the way.", encounter: "Spores burst from a bloated fungus blocking the path.", choices: ["Smash through", "Burn it", "Go around via the wall"], outcomes: ["You emerge dizzy but unharmed, with glowing spores in your hair.", "It ignites spectacularly — you dodge the blast.", "The fungus ignores you; you press on safely."] },
  { description: "A guard post with a still-lit lantern on the table — someone was just here.", encounter: "A bandit who took a wrong turn is as surprised to see you as you are.", choices: ["Attack", "Talk", "Pretend to be a ghost"], outcomes: ["You disarm them quickly and they flee, dropping 3 gold.", "They nervously offer to trade maps — you gain a clue.", "They scream and run, leaving their pack behind — 2 gold inside."] },
  { description: "A cathedral-scale cavern whose ceiling disappears into darkness above.", encounter: "A giant bat colony stirs as you enter, thousands of eyes blinking open.", choices: ["Move very slowly", "Run through", "Light a torch"], outcomes: ["They resettle; you cross unharmed.", "They swarm — 1 HP damage but you reach the far door.", "The light scatters them upward; you walk through the chaos."] },
  { description: "A clockwork room whose gears turn endlessly, purpose unknown.", encounter: "A mechanical guardian rolls forward, grinding gears ominously.", choices: ["Jam the gears", "Find the off-switch", "Charge it"], outcomes: ["It seizes up mid-roll — you step over it.", "A lever behind a pillar stops it cold.", "Your hit dents it but it keeps coming — 1 HP damage before you flee."] },
  { description: "A prison corridor with rusted cells, most empty, one with a scratching sound.", encounter: "An imprisoned shadow demon rattles the bars of a cracked cell.", choices: ["Open the cell", "Ignore it", "Offer it darkness"], outcomes: ["It escapes — but ignores you, fleeing deeper into the dungeon.", "The scratching follows you to the next room.", "It goes still and whispers a secret about a nearby room."] },
  { description: "A mirror gallery where your reflection moves a half-second behind.", encounter: "One reflection steps fully out of its mirror and advances.", choices: ["Smash the mirror", "Flee", "Copy its movements exactly"], outcomes: ["It shatters — the double collapses into shards.", "It pursues you into the corridor — 1 HP damage.", "Confused, it freezes and melts back into glass."] },
  { description: "A kitchen where something still bubbles in a cauldron over cold coals.", encounter: "A rat the size of a dog sits on the counter, gnawing a bone.", choices: ["Fight it", "Offer scraps", "Sneak to the far door"], outcomes: ["It squeals and runs; you grab its cache — 1 gold.", "It accepts and lets you pass, almost friendly.", "You make it without incident."] },
  { description: "A torture chamber whose implements are covered in a thick layer of dust.", encounter: "The ghost of a torturer wanders the room, confused by your presence.", choices: ["Speak to it", "Destroy the instruments", "Ignore it"], outcomes: ["It tells you of hidden gold beneath the rack — you find 2 coins.", "It wails and dissipates in grief.", "It drifts through you — 0 damage but the chill is unpleasant."] },
  { description: "A narrow bridge over a chasm from which distant howls echo upward.", encounter: "The bridge begins to crack as you step onto it.", choices: ["Run across fast", "Cross carefully", "Look for another way"], outcomes: ["You sprint across — it collapses behind you with a roar.", "You inch across safely, testing each plank.", "A ledge path adds two turns but you cross safely."] },
  { description: "A wine cellar, racks shattered, bottles mostly smashed — mostly.", encounter: "A drunk goblin is asleep between the racks, snoring loudly.", choices: ["Sneak past", "Wake it up", "Steal the remaining bottles"], outcomes: ["You tiptoe through without waking it.", "It wakes confused and offers to trade jokes for passage.", "You pocket the bottles and it never stirs."] },
  { description: "A museum of stolen relics, each behind a shattered glass case.", encounter: "A magical alarm triggers as you step on a pressure plate.", choices: ["Freeze", "Smash the alarm", "Run"], outcomes: ["The alarm winds down — no guards come, apparently.", "The alarm breaks; silence returns.", "You exit before anything arrives."] },
  { description: "An observatory with a cracked glass dome, stars visible through the gap.", encounter: "A ghostly astronomer mutters calculations, blocking the telescope.", choices: ["Ask what it sees", "Push past", "Find a second exit"], outcomes: ["It points to a star — 'your destiny lies below' — and fades.", "It ignores your shove, solid as fog.", "You find a trapdoor you'd have missed otherwise."] },
  { description: "A butcher's room, cleavers still hanging in neat rows — all recently cleaned.", encounter: "A figure in a bloody apron steps out of the shadows.", choices: ["Raise your weapon", "Speak calmly", "Back out of the room"], outcomes: ["It raises a cleaver — you fight to a standstill and it retreats, 1 HP cost.", "It's just a confused undead cook. It waves you through.", "It doesn't follow — you take the long way round."] },
  { description: "A flooded cistern, waterlogged crates floating near a raised platform.", encounter: "Something large and pale circles beneath the surface.", choices: ["Swim across", "Use the crates as stepping stones", "Drain the cistern"], outcomes: ["You make it — it snaps but misses.", "The crates hold; you cross dry.", "The drain takes time — it surfaces and you see it's just a huge blind fish."] },
  { description: "A nursery filled with dusty cradles, a single music box still playing.", encounter: "A protective wraith forms when you touch the music box.", choices: ["Back away immediately", "Smash the box", "Let it play out"], outcomes: ["It dissipates — threat neutralised.", "It shrieks at the destruction — 1 HP but it's gone.", "The song ends; the wraith sighs and dissolves peacefully."] },
  { description: "A map room with charts of the dungeon pinned to every wall.", encounter: "A cartographer's ghost demands you correct a map before you leave.", choices: ["Fix the map", "Ignore the demand", "Tear it all down"], outcomes: ["It rewards you with a completed level map — you can see all doors ahead.", "It blocks you for one turn with wailing.", "It screams as the maps shred — then goes very quiet."] },
  { description: "A meditation chamber, incense still smouldering in ancient burners.", encounter: "A stone golem sits cross-legged, but its eyes track you.", choices: ["Sit opposite it", "Speak to it", "Sneak past"], outcomes: ["It nods once and lets you pass — a benediction of sorts.", "It says one word — 'careful' — then returns to stillness.", "Its eyes follow you to the door but it doesn't move."] },
  { description: "A trophy room with mounted heads of creatures you've never seen before.", encounter: "One of the mounted creatures — still living, somehow — snaps at you.", choices: ["Attack it", "Cover it with cloth", "Examine the other trophies"], outcomes: ["You finish what someone else started — it stills.", "Muffled by the cloth, it calms down.", "You spot a key hanging behind one of the other mounts."] },
];

function getFallbackRoom() {
  return pickRandom(FALLBACK_ROOMS);
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateRoom(state, fromRoomId, direction) {
  const fromRoom = state.rooms.get(fromRoomId);
  const newCoords = {
    x: fromRoom.coords.x + DIR_DELTA[direction].x,
    y: fromRoom.coords.y + DIR_DELTA[direction].y,
  };

  // Check if any existing room sits at these coords
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

  // Determine extra doors (1-2 additional beyond entry)
  const extraDoors = Math.floor(Math.random() * 2) + 1;
  const availableDirs = DIRECTIONS.filter(d => d !== OPPOSITE[direction]);
  const chosenDirs = availableDirs.sort(() => Math.random() - 0.5).slice(0, extraDoors);
  chosenDirs.forEach(d => { newRoom.doors[d] = 'pending'; });

  newRoom.doors[OPPOSITE[direction]] = fromRoomId;
  fromRoom.doors[direction] = newRoom.id;

  // Generate content via LLM, cascade through parsers
  const t0 = Date.now();
  let parsed = null;

  try {
    const prompt = ROOM_PROMPT({ roomType, theme });
    const raw = await llm.generate(prompt, 200);

    parsed = parseKeyValueResponse(raw)
          || parseFillInResponse(raw)
          || parseLoose(raw);

    if (parsed) {
      console.debug('[LLM] parsed successfully');
    }
  } catch (err) {
    console.warn('LLM generation error:', err);
  }

  state.metrics.totalGenerationMs += Date.now() - t0;
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
