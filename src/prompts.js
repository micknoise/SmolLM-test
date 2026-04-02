// Versioned prompt templates

// V1-V3: original multi-section formats (kept for reference)
export const ROOM_PROMPT_V1 = (context) => `You are a dungeon narrator. Describe a new ${context.roomType} room in 1-2 sentences.
Then create an encounter with 3 choices.
Format your response exactly like this:
ROOM: [description]
ENCOUNTER: [what the player sees]
CHOICES: [choice1] | [choice2] | [choice3]
OUTCOME1: [result of choice1]
OUTCOME2: [result of choice2]
OUTCOME3: [result of choice3]`;

export const ROOM_PROMPT_V2 = (context) => `Dungeon room: ${context.roomType}.
ROOM: A [adjective] [noun] chamber with [detail].
ENCOUNTER: [creature or hazard] blocks your path.
CHOICES: Attack | Sneak past | Use item
OUTCOME1: [fight result]
OUTCOME2: [sneak result]
OUTCOME3: [item result]

Now write one for a ${context.roomType} room${context.theme ? ` with a ${context.theme} theme` : ''}:`;

// V4: fill-in style
export const ROOM_PROMPT_V4 = (context) => `Complete this dungeon room (${context.roomType}, ${context.theme} theme):
Room: The ${context.roomType} is
Danger: A`;

// V5 (active): ask only for descriptions, no structured output required.
// Choices and outcomes are handled by curated pools in generator.js.
// This is what SmolLM2-360M can actually do reliably.
export const ROOM_PROMPT_V5 = (context) => `Describe a ${context.theme} dungeon ${context.roomType} in one sentence, then describe one threat inside it in one sentence.`;

export const AUTOPLAY_PROMPT = (roomDesc, encounterText, choices) =>
  `You are in: ${roomDesc}. ${encounterText}
Choices: ${choices.map((c, i) => `${i + 1}. ${c}`).join(', ')}.
Pick the best choice. Reply with just the number (1, 2, or 3).`;

// Active prompt version
export const ROOM_PROMPT = ROOM_PROMPT_V5;
