/**
 * Who is against whom in the classic setting (D65). The peoples (peoples.ts) are factions too; these are the rest. The matrix is
 * constant: nobody here ever changes sides; only what the hero is to each of them moves.
 */
import type { FactionsDef } from '../contract';

const PEOPLES = ['human', 'dwarf', 'halfling', 'elf'] as const;

export const factions: FactionsDef = {
  others: [
    { id: 'watch', name: 'watchman', plural: 'the town watch', regard: 10, aware: true },
    { id: 'smugglers', name: 'smuggler', plural: 'smugglers', regard: 0, aware: true },
    { id: 'bandits', name: 'bandit', plural: 'bandits', regard: -20, aware: true },
    { id: 'goblins', name: 'goblin', plural: 'goblins', regard: -30, aware: true },
    { id: 'cutthroats', name: 'cutthroat', plural: 'cutthroats', regard: -100, aware: true },
    { id: 'undead', name: 'undead', plural: 'the dead that walk', regard: -100, aware: true },
    { id: 'predators', name: 'beast of prey', plural: 'beasts of prey', regard: 0, aware: false },
    { id: 'prey', name: 'grazing beast', plural: 'grazing beasts', regard: 0, aware: false },
    { id: 'vermin', name: 'vermin', plural: 'vermin', regard: 0, aware: false },
    { id: 'beasts', name: 'beast', plural: 'beasts', regard: 0, aware: false },
  ],
  matrix: [
    // The watch stands with the town's peoples and against whatever comes at them.
    ...PEOPLES.map((p) => ['watch', p, 'ally'] as const),
    ...['smugglers', 'bandits', 'goblins', 'cutthroats', 'undead', 'predators'].map((f) => ['watch', f, 'hostile'] as const),
    // The peoples against the lawless, the dead and the wild.
    ...PEOPLES.flatMap((p) => [
      [p, 'bandits', 'hostile'], [p, 'goblins', 'hostile'], [p, 'cutthroats', 'hostile'], [p, 'undead', 'hostile'],
      [p, 'smugglers', 'wary'], [p, 'predators', 'wary'], [p, 'vermin', 'wary'],
    ] as const),
    // The lawless among themselves: goblins and smugglers fight where they meet, bandits and smugglers keep wary.
    ['goblins', 'smugglers', 'hostile'], ['bandits', 'smugglers', 'wary'], ['goblins', 'bandits', 'wary'],
    // The wild: wolves hunt deer.
    ['predators', 'prey', 'hostile'],
    // The dead go for anything living.
    ...['smugglers', 'bandits', 'goblins', 'cutthroats', 'predators', 'prey', 'vermin', 'beasts'].map((f) => ['undead', f, 'hostile'] as const),
  ],
  kill: { own: -8, foes: 3, upTo: 14, first: -3 },
  words: {
    guard: {
      turns: {
        warn: ['Hold there, stranger. This is no road for you.', 'You are a long way from anywhere you belong.', 'Turn back. There is nothing here for you.', 'Easy now. Keep your distance.'],
        last: ['One more step and we cut you down.', 'Last warning. Go back.', 'I said stay out. I will not say it again.'],
        settle: ['That is right. Keep walking.', 'Wise. Go on your way.', 'Good. Forget you saw us.'],
        greet: ['Ah, it is you. Pass, friend.', 'Go on through. We never saw you.'],
        yield: ['Leave it, lads. He is too much for us.', 'Not that one. Let him pass.'],
      },
      talk: {
        terms: ['Keep clear of us and our hole. Your word on it?', 'We want no trouble. Stay away, and give your word.'],
        deal: ['Good. We never saw you. Go on.', 'Your word is enough. Pass, and keep it.'],
        short: ['Your word? You do not mean it. Back off.'],
      },
      breaks: {
        line: ['That is far enough!', 'You were told!', 'Get him!'],
        struck: ['He struck first! Get him!', 'Blood! Cut him down!'],
        hated: ['It is you! You have spilled our blood!', 'That face! Kill him!'],
        hired: ["You are the one they sent for us! Get him!", 'So you are the hired blade! Kill him!'],
        kin: ['You cut down our own! Get him!', 'He killed our friends! Kill him!'],
      },
    },
    rob: {
      turns: {
        warn: ['Halt, traveller!', 'Stop right there!', 'Not so fast, friend!'],
        demand: ['Your purse, or your life.', 'Hand over your coin and walk on.', 'Pay up, and nobody bleeds.'],
        settle: ['Off with you, then.', 'Run along. Not worth the trouble.', 'Go on, we have no quarrel.'],
        greet: ['Well met, friend. The road is yours.', 'Ha! You. Go on, no toll for you.'],
        yield: ['Leave it, lads. Not worth it.', 'Back, lads. That one bites.'],
      },
      talk: {
        terms: ['{coins} and you walk on. Or we take it all.', 'Toll is {coins}. Pay it, and the road is yours.', 'Give us {coins} and no one bleeds today.'],
        deal: ['A wise traveller. We will remember this.', 'Pleasure. Off you go. You are known to us now.'],
        short: ['That is not {coins}! Pay, or bleed.', 'Not enough! {coins}, I said!'],
      },
      breaks: {
        line: ['Too close! Take him!', 'He means trouble! Cut him!'],
        struck: ['He drew on us! Kill him!', 'You will pay for that in blood!'],
        hated: ['You! You killed our own! Get him!', 'That is the one who cut down our friends!'],
        hired: ['You are the one the town sent! Get him!', 'A hired sword! Cut him down!'],
        kin: ['You killed our brothers! Get him!', 'That is the one who butchered the others!'],
        patience: ['Then we take it from your corpse!', 'Wrong answer! Get him, lads!'],
      },
    },
    jeer: {
      turns: {
        jeer: ['Big one come! Snik cut him!', 'Pretty boots! Give-give!', 'Ha! Tall fool! Tall fool!', 'Go back! This our hole!', 'Smell him! He smell of soap!'],
        settle: ['Run-run! Hee! He run!', 'Scared! Big one scared!'],
        greet: ['Friend! Friend come! No hurt!', 'Hee, friend! Pass-pass!'],
        yield: ['Big one too big! Go-go! Hide!', 'No fight that one! Run!'],
      },
      breaks: {
        line: ['Too near! Cut him!', 'Get him! Get him!'],
        struck: ['He hit! He hit Snik! Get him!', 'Kill-kill! He hit us!'],
        hated: ['It him! It him that kill us! Get him!', 'The killer! Kill the killer!'],
        hired: ['Sent-one! He the sent-one! Get him!', 'They send him! Kill-kill!'],
        kin: ['He kill Snik kin! Get him!', 'Killer of kin! Kill him!'],
        many: ['Many! We many! Get him!', 'Enough talk! Cut him!'],
        frail: ['He hurt! He weak! Get him!', 'Bleeding! Kill him now!'],
      },
    },
  },
};
