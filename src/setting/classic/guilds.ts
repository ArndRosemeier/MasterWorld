/**
 * The classic world's guild houses (D49, D59): where a hero learns abilities, each at a level. The fighting
 * houses first; the hidden house teaches what is not for the public eye. The magic teachers (C3): the hedge
 * witch on the town's edge, the hidden Undercroft, the warden of the half-ruined tower past the fields. The
 * bard at the inn knows them all.
 */
import type { BardDef, GuildDef } from '../contract';
import { abilities } from './abilities';

/** A school's spells, lowest level first. */
const spellsOf = (...schools: string[]): string[] =>
  abilities.filter((a) => a.school && schools.includes(a.school)).sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || schools.indexOf(a.school!) - schools.indexOf(b.school!)).map((a) => a.id);

export const guilds: readonly GuildDef[] = [
  {
    keeper: 'master-at-arms', name: 'the Hall of Arms', title: '{name}, master of the Hall of Arms', topic: 'Can you teach me to fight?',
    line: 'Iron wants to be swung a certain way. I open the way; the swinging you do yourself.',
    about: 'the sword, the axe, the mace and the shield', teaches: ['cleave', 'bash', 'brace', 'sunder'], price: 22, hours: 2,
    sizes: ['village', 'town', 'capital'], near: 'smithy', hall: true, sign: '#963224', dress: 'fighter',
    teachesLine: 'Stand like this. No, like this. Good: {ability} is yours now. Use it well.',
    distrust: 'Not yet. Your hands are not ready for {ability}. Go out, fight, see something of the world, then come back.',
    task: { ask: 'Words are cheap. Clear one of the places folk whisper about, and I will open the higher forms.', done: 'I heard. That was done well. The Hall stands open to you.', from: 5 },
  },
  {
    keeper: 'lodge-master', name: "the Wayfarers' Lodge", title: '{name}, of the Wayfarers\' Lodge', topic: 'You rode with the caravans?',
    line: 'Twenty years on the roads before they closed. Spear, feet and stars kept us alive. The Lodge still teaches them.',
    about: 'the spear, the open hand and the long road', teaches: ['lunge', 'sidestep', 'trip', 'long-road'], price: 20, hours: 2,
    sizes: ['town', 'capital'], near: 'edge', hall: true, sign: '#3f5a38', dress: 'traveller',
    teachesLine: 'There. That is how we did it on the roads. {ability} is yours now.',
    distrust: 'The Lodge teaches that to people who have been somewhere. You have not, yet. Walk a few roads first.',
    task: { ask: 'Out past the fields there are places nobody goes. Go to one, clear it and come back.', done: 'Back from out there, and in one piece. The Lodge is yours.', out: true, from: 5 },
  },
  {
    keeper: 'locksmith', name: 'the Quiet Room', title: '{name}, who keeps the Quiet Room', topic: 'I was told to knock twice.',
    line: 'Softly. Nobody in this room has ever been here. Do you understand?',
    about: 'how to move unseen', teaches: ['sneak', 'backstab', 'dust'], price: 26, hours: 2,
    sizes: ['town', 'capital'], near: 'inn', hidden: true,
    way: 'knock twice at the back door of the house behind the inn and say you were told to',
    teachesLine: 'Like that, and never in daylight. {ability} is yours. We never met.',
    distrust: 'Green as grass. You would put your foot through the first board. Come back when you have lived a little.',
    task: { ask: 'A place below a house, cleared, and nobody the wiser. Then we talk again.', done: 'Nobody saw a thing. Good.', house: true, from: 4 },
  },
  // The magic teachers (C3): small houses a little out of the way, one teacher for a school or two (D49).
  {
    keeper: 'hedge-witch', name: "the hedge witch's cottage", title: '{name}, the hedge witch', topic: 'They say you know the old ways.',
    line: 'Roots and stones remember what folk forgot. Sit. The kettle is on.',
    about: 'vitae and geomancy', teaches: spellsOf('vitae', 'geomancy'), price: 20, first: 8, hours: 2,
    sizes: ['town', 'capital'], near: 'edge', sign: '#6b7d3c', dress: 'traveller',
    teachesLine: 'Again, slower. There: {ability} is yours. Do not waste it on show.',
    distrust: 'Not yet, child. {ability} is not for hands that have done so little. Go out and live first.',
    task: { ask: 'Out past the fields something sours the ground. Go and end it, and I will show you deeper things.', done: 'The ground breathes easier. You did that. Sit closer.', out: true, from: 4 },
    // Otter form is sold nowhere either (S6): the witch gives it for one deed.
    quest: {
      reward: 'otter', kinds: ['cave', 'barrow'], level: 5,
      ask: 'The water has a shape too, older than the boats. Something foul sits in {place}, where the old ones kept it. Clear it, and I will teach you to wear the otter.',
      done: 'Clean again. Now: hold your breath, longer, longer, and think of cold water sliding by. There. The otter knows you. Try it where the water is deep.',
    },
  },
  {
    keeper: 'undercroft-keeper', name: 'the Undercroft', title: '{name}, who keeps the Undercroft', topic: 'The cold sent me.',
    line: 'Down here the light does not reach and nobody asks questions. Shadow and frost are patient teachers.',
    about: 'umbramancy and cryomancy', teaches: spellsOf('umbramancy', 'cryomancy'), price: 22, first: 10, hours: 2,
    sizes: ['town', 'capital'], near: 'inn', hidden: true,
    way: 'go down the cellar steps of the house by the inn and say the cold sent you',
    teachesLine: 'Like that. {ability} is yours now. It was old before the Fading. Tell no one.',
    distrust: 'You are too new to this. {ability} would eat you. Come back older in the ways of the world.',
    task: { ask: 'There is a place below a house where something ugly has made its nest. Empty it, quietly.', done: 'Quietly done. The Undercroft remembers.', house: true, from: 4 },
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
    about: 'pyromancy and luminism', teaches: spellsOf('pyromancy', 'luminism'), price: 21, first: 9, hours: 2,
    sizes: ['town'], near: 'out', sign: '#b0662a', dress: 'traveller',
    teachesLine: 'Hold it, shape it, let it go. {ability} is yours. Mind the thatch in town.',
    distrust: 'Fire in green hands burns the town. Grow first, then {ability}.',
    task: { ask: 'Something nests in a place out on the land that was never meant for it. Burn it out, then come back.', done: 'I saw the smoke from up here. Well done. Come up.', out: true, from: 4 },
  },
];

export const bard: BardDef = {
  topic: 'Where can I learn something?',
  line: 'Every house that teaches anything, I know. Give me your map.',
  tells: '{house} teaches {about}; ask for {keeper}.',
  tellsOut: '{keeper} keeps watch at {house} {dir} of the town, past the fields, and teaches {about}.',
  tellsHidden: '{house} teaches {about}, though nobody will say so: {way}.',
};
