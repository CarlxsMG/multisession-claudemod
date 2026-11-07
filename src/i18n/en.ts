// The crew's UI in English, the language it speaks unless told otherwise.
// Every other locale gives the same keys (`Messages`); a key's comment says
// where it shows.
import { enVibes } from './en-vibes'

export const en = {
  /** The person at the keyboard: the feed's bubble, and its one quiet line. */
  user: 'You',
  userLine: 'you',
  /** A worker's status, as the pane and the check-ins name it. */
  status: {
    starting: 'starting',
    working: 'working',
    waiting: 'waiting',
    idle: 'free',
    done: 'done',
    failed: 'failed',
    stopped: 'stopped',
  },
  /** The verb a line about a run's end takes: `Pip finished`. */
  endVerb: { done: 'finished', failed: 'failed', stopped: 'stopped' },
  /** What a run is busy with, read off its tool calls. */
  phase: {
    thinking: 'thinking',
    reading: 'reading',
    editing: 'editing',
    running: 'running',
    testing: 'testing',
    web: 'browsing',
    delegating: 'delegating',
    waiting: 'waiting',
  },
  /** The usage windows, in at most five columns. */
  limit: { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' } as Record<string, string>,
  /** An age under ten seconds. */
  now: 'now',
  /** What the person pasted in the desktop app, in the feed. */
  pasted: '[pasted]',
  /** What the orchestrator is doing while it hands work out. */
  delegatingTo: (what: string) => `Delegating: ${what}`,
  talkingTo: (who: string) => `Talking to ${who}`,
  /** A feed line of a message that did not arrive, with the reason when known. */
  notDelivered: (text: string, reason?: string) => (reason === undefined ? `${text} (not delivered)` : `${text} (not delivered: ${reason})`),
  /** The toasts of a message that did not arrive. */
  missedWorker: (name: string, reason: string) => `Did not reach ${name}: ${reason}`,
  missedRelay: (name: string, by: string, reason: string) => `${by}'s message did not reach ${name}: ${reason}`,
  /** The shells and Monitors left running in the background. */
  background: {
    /** The toast of a stop that failed or was refused: what the task runs, and why. */
    stopFailed: (what: string, reason: string) => `Could not stop ${what}: ${reason}`,
    /** Why a stop the crew tried on its own did not go: the rules ask the person first. */
    refused: 'it needs your approval; press Stop in the crew pane',
    /** The team view's heading over them. */
    heading: (n: number) => `Running in the background · ${n}`,
    /** The press that stops one. */
    stop: '■ Stop',
    /** Whose a task is when the main conversation started it. */
    main: 'main',
    /** What a Monitor's line says it is; a shell's says nothing. */
    monitor: 'monitor',
    /** The main view's press that opens the team view, beside the crew's count. */
    running: (n: number) => `${n} in background`,
  },
  progress: {
    /** A plan's step in a line: ` · step 3/5`. */
    step: (step: string) => `step ${step}`,
    steps: (step: string) => `${step} steps`,
    grown: 'the plan grew',
    share: (percent: number) => `${percent} % of the steps`,
    left: (time: string) => `≈${time} more (estimated)`,
    calls: (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}`,
    lastRun: (time: string) => `last ${time}`,
    /** A check-in row's title and its folded summary. */
    every: (minutes: number) => ` · check-in every ${minutes}m`,
    noCheckIns: ' · no check-ins',
    roundOver: (time: string) => ` · round over · ${time}`,
    roundOf: (time: string) => ` · round of ${time}`,
    nobody: ' · nobody working',
    active: (n: number, time: string) => ` · ${n} active · round ${time}`,
    round: (time: string) => ` · round ${time}`,
    more: (n: number) => `+${n} more`,
    /** The end of a message between agents' line. */
    wakes: ' · wakes it',
    lost: ' · not delivered',
  },
  transcript: {
    /** What a SendMessage of the main conversation did, under its row. */
    wakes: 'wakes ',
    woke: 'wakes',
    delivered: 'delivered',
    /** What a delegate call did, under its row. */
    heldFor: 'waiting · answers to ',
    held: 'waiting',
    reused: 'reused · keeps its context',
    reusedShort: 'reused',
    fresh: 'new',
    and: ' and ',
    worksHere: (n: number): string => (n > 1 ? ' work here' : ' works here'),
    moreHere: (n: number) => `${n} more here`,
    /** A row's press to open it whole, and to fold it again. */
    showAll: 'Show all',
    showLess: 'Show less',
  },
  pane: {
    /** The orchestrator's figure, to a screen reader. */
    orchAlt: (name: string) => `${name}, the orchestrator`,
    /** Who a line about delegating speaks of before any worker has a name. */
    anyWorker: 'the crew',
    count: (n: number, active: number) => `${n} ${n === 1 ? 'worker' : 'workers'} · ${active} active`,
    team: 'Crew',
    delegate: 'Delegate',
    customize: 'Customize',
    edit: 'Edit',
    back: '◀ Back',
    clearFinished: 'Clear finished',
    /** The pane's title, as Claude Code shows it over the pane. */
    title: 'Crew',
    /** A switch's two values; three columns at most. */
    on: 'ON',
    off: 'OFF',
    /**
     * A worker's status under its card, in its four columns, where `status`
     * does not fit; a free worker's card says nothing. The same words in
     * every locale: four columns hold no translation of them.
     */
    card: { starting: 'init', working: 'work', waiting: 'wait', idle: '', done: 'done', failed: 'fail', stopped: 'stop' },
  },
  editor: {
    heading: 'customize',
    previewAlt: (name: string) => `${name}, your mascot`,
    tabs: { persona: 'Character', face: 'Face', hair: 'Head', clothes: 'Body', extras: 'Extras', share: 'Share' },
    /** A stepper's arrows, to a screen reader. */
    previous: (part: string) => `${part}: previous`,
    next: (part: string) => `${part}: next`,
    nameColor: 'Name color',
    name: 'Name ',
    save: 'save',
    personality: 'Personality',
    fur: 'Fur',
    eyes: 'Eyes',
    mouth: 'Mouth',
    facial: 'Details',
    cheeks: 'Cheeks',
    cheeksPlain: 'Plain',
    cheeksBlush: 'Blushing',
    shape: 'Shape',
    color: 'Color',
    markings: 'Markings',
    paws: 'Paws',
    feet: 'Feet',
    accessory: 'Accessory',
    copyCode: 'Copy code',
    copied: (name: string) => `${name}'s code copied`,
    /** The toast of a copy that failed or another plugin denied; `/crew code` answers with the code either way. */
    copyFailed: 'Code not copied: /crew code shows it',
    import: 'Import ',
    importHint: 'paste a CREW1.… code',
    importVerb: 'import',
    badCode: 'That code is not valid',
    random: 'Random',
    reset: 'Default',
    done: 'Done',
    /** The key that presses Done, its word's first letter. */
    doneKey: 'd',
    /** The worker a personality's delegating line names in its sample. */
    sampleWorker: 'Pip',
  },
  /** The `/crew` command: its line in the command list, and the words it takes. What it answers is model text (`src/prompts/commands.ts`). */
  command: {
    description: "The orchestrator's pane and its crew of workers",
    argumentHint: '[edit | team | msg <worker> <text> | code | import <code> | random | mode on|off | clear | progress [1m|2m|3m|5m|10m|off]]',
    /**
     * The words `/crew` takes for each verb. A word of any locale's works
     * whatever the UI speaks, so no word may name two verbs.
     */
    verbs: {
      edit: ['edit'],
      team: ['team'],
      msg: ['msg'],
      code: ['code'],
      import: ['import'],
      random: ['random'],
      mode: ['mode'],
      clear: ['clear'],
      progress: ['progress'],
    },
    /** The units `/crew progress` takes after its minutes (`5m`); those of any locale work. */
    minutes: ['m', 'min', 'mins'],
  },
  /** The personalities' names and lines, by the key a look stores. */
  vibes: enVibes,
  /** A new orchestrator's catchphrase. */
  defaultPhrase: 'Let’s go!',
  /** A figure's parts in the editor, by the key a look stores. */
  parts: {
    hair: {
      short: 'Little ears',
      fringe: 'Tuft',
      long: 'Floppy ears',
      spiky: 'Spikes',
      bun: 'Topknot',
      mohawk: 'Crest',
      afro: 'Mane',
      ponytail: 'Sprout',
      pigtails: 'Plumes',
      buzz: 'Fuzz',
      bald: 'None',
    },
    eyes: { dot: 'Dots', big: 'Big', shine: 'Sparkle', wide: 'Wide', happy: 'Happy ^^', wink: 'Wink' },
    mouth: { smile: 'Smile', grin: 'Teeth', small: 'Small', open: 'Surprise', tongue: 'Tongue', flat: 'Serious' },
    facial: { none: 'None', mustache: 'Whiskers', beard: 'Freckles', goatee: 'Fangs' },
    shirt: {
      tee: 'None',
      stripes: 'Stripes',
      hoodie: 'Belly',
      suit: 'Collar',
      labcoat: 'Spots',
      overalls: 'Bib',
      logo: 'Badge',
    },
    acc: {
      none: 'None',
      glasses: 'Glasses',
      shades: 'Sunglasses',
      headphones: 'Headphones',
      cap: 'Cap',
      beanie: 'Beanie',
      crown: 'Crown',
      halo: 'Halo',
      bow: 'Bow',
      flower: 'Flower',
      horns: 'Horns',
      catears: 'Cat ears',
      antenna: 'Antenna',
      scarf: 'Scarf',
    },
  },
  /** The colours' names in the editor, by the id the catalog gives each. */
  colors: {
    cream: 'Cream',
    peach: 'Peach',
    lemon: 'Lemon',
    mint: 'Mint',
    sky: 'Sky',
    lavender: 'Lavender',
    bubblegum: 'Bubblegum',
    cocoa: 'Cocoa',
    black: 'Black',
    chestnut: 'Chestnut',
    blond: 'Blond',
    ginger: 'Ginger',
    grey: 'Grey',
    white: 'White',
    red: 'Red',
    orange: 'Orange',
    yellow: 'Yellow',
    green: 'Green',
    blue: 'Blue',
    navy: 'Navy',
    purple: 'Purple',
    pink: 'Pink',
    lilac: 'Lilac',
    brown: 'Brown',
    denim: 'Denim',
    claude: 'Claude',
    lightBlue: 'Light blue',
    turquoise: 'Turquoise',
    violet: 'Violet',
    coral: 'Coral',
    lime: 'Lime',
  },
}

export type Messages = typeof en
