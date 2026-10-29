/**
 * The classic world's guild houses (D49): where a hero opens a skill and its ranks. The fighting houses
 * first (the smith's and the old caravan guard's lessons moved into them); the hidden house teaches what
 * is not for the public eye. The magic teachers (C3): the hedge witch on the town's edge, the hidden Undercroft, the warden of the half-ruined tower past the fields. The bard at the inn knows them all.
 */
import type { BardDef, GuildDef, SkillRankDef } from '../contract';

/** Rank 0 is the opening; each rank is bought, and asks a level of the hero (D58); the third also the guild's task. */
export const skillRanks: readonly SkillRankDef[] = [
  { upTo: 25, price: 40 },
  { upTo: 50, price: 160, level: 2 },
  { upTo: 75, price: 600, task: true, level: 4 },
  { upTo: 100, price: 2000, level: 7 },
];

export const guilds: readonly GuildDef[] = [
  {
    keeper: 'master-at-arms', name: 'the Hall of Arms', title: '{name}, master of the Hall of Arms', topic: 'Can you teach me to fight?',
    line: 'Iron wants to be swung a certain way. I open the way; the swinging you do yourself.',
    skills: ['blades', 'axes', 'maces', 'shields', 'armour'], upTo: 100, price: 15, hours: 2,
    sizes: ['village', 'town', 'capital'], near: 'smithy', hall: true, sign: '#963224', dress: 'fighter',
    opens: 'Stand like this. No, like this. Good: now {skill} is yours to grow.',
    distrust: 'Not yet. Your hands are not ready for more {skill}. Go out, fight, see something of the world, then come back.',
    task: { ask: 'Words are cheap. Clear one of the places folk whisper about, and I will open the higher forms.', done: 'I heard. That was done well. The Hall stands open to you.' },
  },
  {
    keeper: 'lodge-master', name: "the Wayfarers' Lodge", title: '{name}, of the Wayfarers\' Lodge', topic: 'You rode with the caravans?',
    line: 'Twenty years on the roads before they closed. Spear, feet and stars kept us alive. The Lodge still teaches them.',
    skills: ['spears', 'dodge', 'unarmed', 'orientation'], upTo: 100, price: 14, hours: 2,
    sizes: ['town', 'capital'], near: 'edge', hall: true, sign: '#3f5a38', dress: 'traveller',
    opens: 'There. That is how we did it on the roads. {skill} is yours now; the road will do the rest.',
    distrust: 'The Lodge teaches that to people who have been somewhere. You have not, yet. Walk a few roads first.',
    task: { ask: 'Out past the fields there are places nobody goes. Go to one, clear it and come back.', done: 'Back from out there, and in one piece. The Lodge is yours.', out: true },
  },
  {
    keeper: 'locksmith', name: 'the Quiet Room', title: '{name}, who keeps the Quiet Room', topic: 'I was told to knock twice.',
    line: 'Softly. Nobody in this room has ever been here. Do you understand?',
    skills: ['stealth'], upTo: 100, price: 17, hours: 2,
    sizes: ['town', 'capital'], near: 'inn', hidden: true,
    way: 'knock twice at the back door of the house behind the inn and say you were told to',
    opens: 'Feet on the edges of the boards, breath through the nose. {skill} is yours. We never met.',
    distrust: 'Green as grass. You would put your foot through the first board. Come back when you have lived a little.',
    task: { ask: 'A place below a house, cleared, and nobody the wiser. Then we talk again.', done: 'Nobody saw a thing. Good.' },
  },
  // The magic teachers (C3): small houses a little out of the way, one teacher for a school or two (D49).
  {
    keeper: 'hedge-witch', name: "the hedge witch's cottage", title: '{name}, the hedge witch', topic: 'They say you know the old ways.',
    line: 'Roots and stones remember what folk forgot. Sit. The kettle is on.',
    skills: ['vitae', 'geomancy'], upTo: 100, price: 20, hours: 2,
    sizes: ['town', 'capital'], near: 'edge', sign: '#6b7d3c', dress: 'traveller',
    opens: 'Hold out your hands. Feel that, under the skin? That is {skill}. It was always there; now it listens.',
    distrust: 'Not yet, child. {skill} is not for hands that have done so little. Go out and live first.',
    task: { ask: 'Out past the fields something sours the ground. Go and end it, and I will show you deeper things.', done: 'The ground breathes easier. You did that. Sit closer.', out: true },
    spellPrice: 60, openPrice: 8, teachesSpell: 'Again, slower. There: {spell} is yours. Do not waste it on show.',
  },
  {
    keeper: 'undercroft-keeper', name: 'the Undercroft', title: '{name}, who keeps the Undercroft', topic: 'The cold sent me.',
    line: 'Down here the light does not reach and nobody asks questions. Shadow and frost are patient teachers.',
    skills: ['umbramancy', 'cryomancy'], upTo: 100, price: 22, hours: 2,
    sizes: ['town', 'capital'], near: 'inn', hidden: true,
    way: 'go down the cellar steps of the house by the inn and say the cold sent you',
    opens: 'Breathe out, and do not breathe in again until I say. Feel it? {skill} is yours now. Tell no one.',
    distrust: 'You are too new to this. {skill} would eat you. Come back older in the ways of the world.',
    task: { ask: 'There is a place below a house where something ugly has made its nest. Empty it, quietly.', done: 'Quietly done. The Undercroft remembers.' },
    spellPrice: 66, openPrice: 10, teachesSpell: 'Like that. {spell} is yours now. It was old before the Fading.',
    // Bird form is sold nowhere (C14): the keeper gives it for one deed, to a student folk here trust.
    quest: {
      reward: 'bird', kinds: ['tower', 'barrow'], level: 4,
      ask: 'You have been patient. There is an older thing than frost: the shape of a bird, kept in {place} before the Fading. Something has nested there since. Clear it and come back, and I will show you how the shape is worn.',
      done: 'Then it is clean again. Come here. Breathe out, all of it, and think of wind under feathers. There: the shape knows you now. Go up under the open sky before you try it.',
    },
  },
  {
    keeper: 'tower-warden', name: 'the half-ruined tower', title: '{name}, warden of the half-ruined tower', topic: 'Do you still keep the old fire?',
    line: 'Someone has to keep watch. The beacon went dark with the Fading; the fire and the light did not, not quite.',
    skills: ['pyromancy', 'luminism'], upTo: 100, price: 21, hours: 2,
    sizes: ['town'], near: 'out', sign: '#b0662a', dress: 'traveller',
    opens: 'Look into the flame and do not blink. There. {skill} answers you now; keep it fed.',
    distrust: 'Fire in green hands burns the town. Grow first, then {skill}.',
    task: { ask: 'Something nests in a place out on the land that was never meant for it. Burn it out, then come back.', done: 'I saw the smoke from up here. Well done. Come up.', out: true },
    spellPrice: 64, openPrice: 9, teachesSpell: 'Hold it, shape it, let it go. {spell} is yours. Mind the thatch in town.',
  },
];

export const bard: BardDef = {
  topic: 'Where can I learn a skill?',
  line: 'Every house that teaches anything, I know. Give me your map.',
  tells: '{house} teaches {skills}; ask for {keeper}.',
  tellsOut: '{keeper} keeps watch at {house} {dir} of the town, past the fields, and teaches {skills}.',
  tellsHidden: '{house} teaches {skills}, though nobody will say so: {way}.',
};
