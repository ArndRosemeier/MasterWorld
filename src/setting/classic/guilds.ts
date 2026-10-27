/**
 * The classic world's guild houses (D49): where a hero opens a skill and its ranks. The fighting houses
 * first (the smith's and the old caravan guard's lessons moved into them); the hidden house teaches what
 * is not for the public eye. The magic teachers (C3): the hedge witch on the town's edge, the hidden Undercroft. The bard at the inn knows them all.
 */
import type { BardDef, GuildDef, SkillRankDef } from '../contract';

/** Rank 0 is the opening; a next rank needs the one before reached by use, the third the guild's task. */
export const skillRanks: readonly SkillRankDef[] = [
  { upTo: 25, price: 40 },
  { upTo: 50, price: 160 },
  { upTo: 75, price: 600, task: true },
  { upTo: 100, price: 2000, standing: 40 },
];

export const guilds: readonly GuildDef[] = [
  {
    keeper: 'master-at-arms', name: 'the Hall of Arms', title: '{name}, master of the Hall of Arms', topic: 'Can you teach me to fight?',
    line: 'Iron wants to be swung a certain way. I open the way; the swinging you do yourself.',
    skills: ['blades', 'axes', 'maces', 'shields', 'armour'], upTo: 100, price: 30, hours: 2,
    sizes: ['village', 'town', 'capital'], near: 'smithy', sign: '#963224', dress: 'fighter',
    opens: 'Stand like this. No, like this. Good: now {skill} is yours to grow.',
    unearned: 'Not yet. Your {skill} has not been tested enough out there. Come back when it has.',
    task: { ask: 'Words are cheap. Clear one of the places folk whisper about, and I will open the higher forms.', done: 'I heard. That was done well. The Hall stands open to you.' },
  },
  {
    keeper: 'lodge-master', name: "the Wayfarers' Lodge", title: '{name}, of the Wayfarers\' Lodge', topic: 'You rode with the caravans?',
    line: 'Twenty years on the roads before they closed. Spear, feet and stars kept us alive. The Lodge still teaches them.',
    skills: ['spears', 'dodge', 'unarmed', 'orientation'], upTo: 100, price: 28, hours: 2,
    sizes: ['town', 'capital'], near: 'edge', sign: '#3f5a38', dress: 'traveller',
    opens: 'There. That is how we did it on the roads. {skill} is yours now; the road will do the rest.',
    unearned: 'You have not walked enough road for that. More {skill} out there first.',
    task: { ask: 'Out past the fields there are places nobody goes. Go to one, clear it and come back.', done: 'Back from out there, and in one piece. The Lodge is yours.', out: true },
  },
  {
    keeper: 'locksmith', name: 'the Quiet Room', title: '{name}, who keeps the Quiet Room', topic: 'I was told to knock twice.',
    line: 'Softly. Nobody in this room has ever been here. Do you understand?',
    skills: ['stealth'], upTo: 100, price: 34, hours: 2,
    sizes: ['town', 'capital'], near: 'inn', hidden: true,
    way: 'knock twice at the back door of the house behind the inn and say you were told to',
    opens: 'Feet on the edges of the boards, breath through the nose. {skill} is yours. We never met.',
    unearned: 'You still sound like a cart on cobbles. More {skill} first.',
    task: { ask: 'A place below a house, cleared, and nobody the wiser. Then we talk again.', done: 'Nobody saw a thing. Good.' },
  },
  // The magic teachers (C3): small houses a little out of the way, one teacher for a school or two (D49).
  {
    keeper: 'hedge-witch', name: "the hedge witch's cottage", title: '{name}, the hedge witch', topic: 'They say you know the old ways.',
    line: 'Roots and stones remember what folk forgot. Sit. The kettle is on.',
    skills: ['vitae', 'geomancy'], upTo: 100, price: 40, hours: 2,
    sizes: ['town', 'capital'], near: 'edge', sign: '#6b7d3c', dress: 'traveller',
    opens: 'Hold out your hands. Feel that, under the skin? That is {skill}. It was always there; now it listens.',
    unearned: 'The land does not answer you yet. Use your {skill} out there until it does.',
    task: { ask: 'Out past the fields something sours the ground. Go and end it, and I will show you deeper things.', done: 'The ground breathes easier. You did that. Sit closer.', out: true },
    spellPrice: 60, openPrice: 8, teachesSpell: 'Again, slower. There: {spell} is yours. Do not waste it on show.',
  },
  {
    keeper: 'undercroft-keeper', name: 'the Undercroft', title: '{name}, who keeps the Undercroft', topic: 'The cold sent me.',
    line: 'Down here the light does not reach and nobody asks questions. Shadow and frost are patient teachers.',
    skills: ['umbramancy', 'cryomancy'], upTo: 100, price: 44, hours: 2,
    sizes: ['town', 'capital'], near: 'inn', hidden: true,
    way: 'go down the cellar steps of the house by the inn and say the cold sent you',
    opens: 'Breathe out, and do not breathe in again until I say. Feel it? {skill} is yours now. Tell no one.',
    unearned: 'You are still too warm for that. More {skill} first.',
    task: { ask: 'There is a place below a house where something ugly has made its nest. Empty it, quietly.', done: 'Quietly done. The Undercroft remembers.' },
    spellPrice: 66, openPrice: 10, abilities: ['bird'], teachesSpell: 'Like that. {spell} is yours now. It was old before the Fading.',
  },
];

export const bard: BardDef = {
  topic: 'Where can I learn a skill?',
  line: 'Every house that teaches anything, I know. Give me your map.',
  tells: '{house} teaches {skills}; ask for {keeper}.',
  tellsHidden: '{house} teaches {skills}, though nobody will say so: {way}.',
};
