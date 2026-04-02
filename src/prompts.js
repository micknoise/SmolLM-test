// Versioned prompt templates — each iteration keeps old versions

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

export const ROOM_PROMPT_V3 = (context) => `<dungeon>
<room type="${context.roomType}"${context.theme ? ` theme="${context.theme}"` : ''}>
<description>Write 1-2 sentences describing this room.</description>
<encounter>Describe what threatens the player in 1 sentence.</encounter>
<choices>
<choice id="1">First option (combat)</choice>
<choice id="2">Second option (stealth)</choice>
<choice id="3">Third option (clever)</choice>
</choices>
<outcome id="1">Result of choice 1.</outcome>
<outcome id="2">Result of choice 2.</outcome>
<outcome id="3">Result of choice 3.</outcome>
</room>
</dungeon>`;

// V4: fill-in-the-blank style — easiest for a small model to follow
export const ROOM_PROMPT_V4 = (context) => `Complete this dungeon room (${context.roomType}, ${context.theme} theme):
Room: The ${context.roomType} is
Danger: A
Choice 1: Attack
Choice 2: Sneak
Choice 3: Use item
Result 1: You attack and
Result 2: You sneak and
Result 3: You use an item and`;

export const AUTOPLAY_PROMPT = (roomDesc, encounterText, choices) =>
  `You are in: ${roomDesc}. ${encounterText}
Choices: ${choices.map((c, i) => `${i + 1}. ${c}`).join(', ')}.
Pick the best choice. Reply with just the number (1, 2, or 3).`;

// Active prompt version
export const ROOM_PROMPT = ROOM_PROMPT_V4;
