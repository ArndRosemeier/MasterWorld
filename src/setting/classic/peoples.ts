/**
 * The classic setting's peoples as factions (plan 11.6, D34): humans, dwarves, halflings and elves, what
 * each thinks of a stranger and of its own kin, and how they greet the hero by standing. The dwarves keep a
 * hold in the hills near the start town: the Gate of Orsdun, its court and its wardens. Their kin in town
 * (the smith's family, the miners at the edge of town) tell of it.
 */
import type { PeopleDef, StandingDef } from '../contract';

export const peoples: readonly PeopleDef[] = [
  {
    id: 'human', name: 'human', plural: 'humans', regard: 5, kin: 15,
    greet: {
      unwelcome: ['You again. Say what you want and be quick.', 'I have nothing for you. What is it?'],
      friend: ['Good to see you again! What can I do for you?', 'There you are. Come, sit a moment if you like.'],
      honoured: ['Make way, make way! Our good friend is here. Anything you need, you only have to ask.', 'Bless you for what you have done for us. What can I do?'],
    },
    refuse: ['Get away from me.', 'I will not talk to you. Go, before I call the others.'],
    curt: ['Nothing I would tell you.', 'Ask someone else.'],
  },
  {
    id: 'dwarf', name: 'dwarf', plural: 'dwarves', regard: 0, kin: 30,
    greet: {
      unwelcome: ['Hm. You. Speak, and keep it short.', 'What do you want? I am busy.'],
      stranger: ['Hm. An outsider. Well, speak.', 'You want something. They always do. Go on.'],
      friend: ['Ah, the friend of the hold. Well met.', 'Well met, friend. The hearth is warm.'],
      honoured: ['Hail, hold-friend! My hammer is yours.', 'Honour to you. The hold sings of what you did.'],
    },
    refuse: ['No word of mine for you, oathless one.', 'Begone. The hold remembers what you did.'],
    curt: ['That is not for outsiders.', 'Dwarf business. Not yours.'],
    hold: {
      name: 'the Gate of Orsdun', ring: [900, 1800], welcome: 'friend', guard: 'hold-warden', guards: 4,
      warn: [
        'A warden raises a gauntlet: “Halt there, outsider! This is the ground of Orsdun. Turn back.”',
        'A horn sounds from the gate: “No further, stranger. Orsdun does not know you.”',
      ],
      last: [
        '“Last warning!” The wardens lower their axes and come down the steps.',
        '“One more step and you will be carried out!” The wardens lower their axes.',
      ],
      attack: 'The wardens of Orsdun charge.',
      hail: [
        'The wardens strike their axe-hafts on the flags: “Hail, friend of Orsdun! Walk in peace.”',
        'A warden lifts a hand in greeting: “Friend of the hold. The gate knows you.”',
      ],
      topic: 'Where is your people\'s hold?',
      told: 'Up in the hills, {hold}. Our kin keep it, and they do not love outsiders. Earn their trust before you climb to it: do right by us here, or bring a gift.',
      lead: 'The hold of the dwarves',
    },
  },
  {
    id: 'halfling', name: 'halfling', plural: 'halflings', regard: 10, kin: 25,
    greet: {
      unwelcome: ['Oh. It\'s you. Well, what is it?'],
      friend: ['Come in, come in! Wipe your boots. Hungry?', 'Look who it is! Sit, sit, the kettle is on.'],
      honoured: ['Our hero! There is a seat by the fire for you, and the best of the pantry.'],
    },
    refuse: ['No. Off with you.', 'We have nothing to say to the likes of you.'],
    curt: ['I couldn\'t say.', 'Not that it is any of your business.'],
  },
  {
    id: 'elf', name: 'elf', plural: 'elves', regard: -5, kin: 30,
    greet: {
      unwelcome: ['You. I would rather not.', 'Must we speak?'],
      friend: ['Ah. A friend among the short-lived. Well met.', 'Well met, friend. The road has been kind to you.'],
      honoured: ['Your name is spoken in the high woods, friend. I am glad to see you.'],
    },
    refuse: ['I do not speak with you.', 'Leave me.'],
    curt: ['That is not a thing I share.', 'It does not concern you.'],
  },
];

export const standing: StandingDef = {
  kept: 10,
  task: 8,
  gift: { price: 60, raise: 5, upTo: 15, topic: 'Accept a gift for your people ({coins}).', line: 'A gift? Hm. Then you know how things are done. I will see it reaches the hold.' },
  trespass: -6,
  struck: -20,
  killed: -30,
  prices: [1.3, 0.85],
};
