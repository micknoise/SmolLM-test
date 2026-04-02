// LLM wrapper — real WebLLM or mock mode
// Mock mode: ?mock=true query param or MOCK_LLM env var

const MODEL_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

const MOCK_ROOMS = [
  {
    description: "A damp stone chamber reeking of mould, its walls streaked with ancient bloodstains.",
    encounter: "A skeletal guard rattles to life, raising a rusted sword.",
    choices: ["Fight the skeleton", "Sneak past", "Smash the altar"],
    outcomes: [
      "You shatter its ribs with a well-placed blow and find a copper coin in the rubble.",
      "You slip by silently, heart pounding, and emerge unscathed.",
      "The altar crumbles, distracting the skeleton long enough for you to escape."
    ]
  },
  {
    description: "A flooded antechamber knee-deep in black water, strange lights flickering below the surface.",
    encounter: "A will-o-wisp bobs toward you, its glow mesmerising.",
    choices: ["Strike at it", "Follow it", "Avert your eyes"],
    outcomes: [
      "Your weapon passes through harmlessly — it drifts away, disinterested.",
      "It leads you to a hidden cache of silver coins before vanishing.",
      "You stumble forward but keep your wits, finding a dry ledge beyond."
    ]
  },
  {
    description: "A vast circular library, shelves reaching into darkness, books chained to their posts.",
    encounter: "A robed lich stands at the central lectern, eyes fixed on you.",
    choices: ["Challenge it", "Bow respectfully", "Steal a book"],
    outcomes: [
      "It raises a hand and blasts you back — you lose 2 HP but land near the exit.",
      "It nods and grants you safe passage, impressed by manners.",
      "You snatch a tome — it explodes in golden light, netting you a spell scroll."
    ]
  },
  {
    description: "A narrow corridor carved through living rock, the ceiling weeping mineral water.",
    encounter: "A giant spider descends from above on a glistening thread.",
    choices: ["Cut the thread", "Retreat", "Offer food"],
    outcomes: [
      "The spider falls, stunned — you dash past before it recovers.",
      "You back away safely and find another route around.",
      "It snatches your ration and scuttles aside, sated."
    ]
  },
  {
    description: "A treasure vault long since looted, empty pedestals gathering dust.",
    encounter: "A mimic lurks among the empty chests, waiting.",
    choices: ["Open a chest", "Burn the room", "Call out the mimic"],
    outcomes: [
      "The mimic springs — you take 1 HP damage but kick it away and find a real gem beneath.",
      "Smoke fills the room; you escape coughing but unbitten.",
      "Surprised by your boldness, the mimic retreats into a corner."
    ]
  },
  {
    description: "A shrine to a forgotten god, candles still burning after centuries.",
    encounter: "A spectral priest demands you pay tribute or face a curse.",
    choices: ["Pay gold", "Desecrate the shrine", "Recite a prayer"],
    outcomes: [
      "You lose 2 gold but receive a blessing: +2 HP.",
      "The priest shrieks and you're cursed — next encounter is harder.",
      "The priest nods and fades, leaving a relic on the altar."
    ]
  },
];

let mockIndex = 0;

function isMockMode() {
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('mock') === 'true';
  }
  return process.env.MOCK_LLM === 'true';
}

function mockGenerate() {
  const room = MOCK_ROOMS[mockIndex % MOCK_ROOMS.length];
  mockIndex++;
  return [
    `ROOM: ${room.description}`,
    `ENCOUNTER: ${room.encounter}`,
    `CHOICES: ${room.choices.join(' | ')}`,
    `OUTCOME1: ${room.outcomes[0]}`,
    `OUTCOME2: ${room.outcomes[1]}`,
    `OUTCOME3: ${room.outcomes[2]}`,
  ].join('\n');
}

class LLMEngine {
  constructor() {
    this.engine = null;
    this._ready = false;
    this.onProgress = null;
  }

  get mock() {
    return isMockMode();
  }

  get ready() {
    return this._ready || this.mock;
  }

  async init(onProgress) {
    if (this.mock) {
      this._ready = true;
      onProgress && onProgress(1.0, 'Mock mode ready');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser. Please use Chrome 113+ or Edge 113+ with a compatible GPU.');
    }

    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    this.engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report) => {
        onProgress && onProgress(report.progress, report.text);
      },
    });
    this._ready = true;
  }

  async generate(prompt, maxTokens = 200) {
    if (!this.ready) throw new Error('LLM not initialised');

    if (this.mock) {
      // Small random delay to simulate generation
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      return mockGenerate();
    }

    const response = await this.engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.8,
      top_p: 0.95,
    });

    return response.choices[0].message.content;
  }

  async generateWithChoice(prompt, maxTokens = 10) {
    if (!this.ready) throw new Error('LLM not initialised');

    if (this.mock) {
      await new Promise(r => setTimeout(r, 30));
      return String(Math.floor(Math.random() * 3) + 1);
    }

    const response = await this.engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
    });

    return response.choices[0].message.content;
  }
}

export const llm = new LLMEngine();
