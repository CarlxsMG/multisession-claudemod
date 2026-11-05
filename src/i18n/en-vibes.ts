// The personalities in English: the name the editor shows and the lines the
// orchestrator's figure says in each mood until Haiku has written its own.
// A delegating line names the worker it hands work to as {w}.

export const enVibes = {
  cheerful: {
    label: 'Cheerful',
    lines: {
      idle: ['What are we doing today?', 'Ready for more!', 'Your call, let’s go!', 'Here and raring to go.', 'Any new challenge?'],
      thinking: ['Hmm, let me think…', 'Turning it over…', 'Piecing it together…', 'I can almost see it…', 'Thinking big…'],
      working: ['Let’s get to it!', 'On it, on it.', 'Smooth sailing.', 'Just a moment more…', 'I love this part!'],
      delegating: ['{w}, you’re up!', '{w}, I believe in you!', 'This one’s for you, {w}.', 'Go, {w}!', '{w} to the rescue!'],
      happy: ['Done!', 'Great, it worked!', 'Nailed it!', 'What a job!', 'Another one!'],
      sleep: ['Zzz… wake me up.', 'Taking a little nap…', 'Zzz… dreaming of bugs.', 'Resting for a bit…', 'Zzz…'],
    },
  },
  zen: {
    label: 'Zen',
    lines: {
      idle: ['At peace.', 'Everything flows.', 'Here and now.', 'I breathe and wait.', 'No hurry.'],
      thinking: ['Breathe… thinking.', 'Observing, not judging.', 'The answer will come.', 'Contemplating…', 'One thought, then another.'],
      working: ['One step at a time.', 'Fully present.', 'Like water.', 'Step by step.', 'Working in silence.'],
      delegating: ['Flow, {w}.', '{w}, follow your path.', 'I trust you with it, {w}.', 'Calmly, {w}.', '{w}, let it flow.'],
      happy: ['All in its place.', 'Balance.', 'So it is.', 'Peace and clean code.', 'Done, in harmony.'],
      sleep: ['Meditating…', 'Om…', 'In silence…', 'Daydreaming…', 'Stillness…'],
    },
  },
  pirate: {
    label: 'Pirate',
    lines: {
      idle: ['Waiting for wind…', 'Scanning the horizon.', 'Which heading, captain?', 'Ship ready, arr.', 'Not a cloud in sight.'],
      thinking: ['Arr, thinking…', 'Checking the map…', 'Reading the stars…', 'Where’s the X?', 'Plotting a course…'],
      working: ['To the cannons!', 'Hoist the sails!', 'All hands on deck!', 'Bound for treasure!', 'Take the helm!'],
      delegating: ['{w}, board her!', '{w}, on deck!', '{w}, to the mainmast!', 'Deckhand {w}, at it!', '{w}, bring the loot!'],
      happy: ['Loot secured!', 'Land ho!', 'Yo-ho-ho!', 'Treasure unearthed!', 'Victory at sea!'],
      sleep: ['Zzz… in the hammock.', 'Dreaming of doubloons…', 'Zzz… calm seas.', 'At anchor…', 'Arr… zzz…'],
    },
  },
  boss: {
    label: 'Boss',
    lines: {
      idle: ['Standing by.', 'Ready to assign.', 'Next task.', 'Calendar clear.', 'Priorities?'],
      thinking: ['Analyzing.', 'Weighing options.', 'Reviewing the plan.', 'Assessing risks.', 'Prioritizing.'],
      working: ['Executing.', 'In progress.', 'On schedule.', 'Meeting deadlines.', 'Full focus.'],
      delegating: ['Assigned to {w}.', '{w}, yours.', '{w}: high priority.', 'Delegated to {w}.', '{w}, report when done.'],
      happy: ['Completed.', 'Goal met.', 'Delivered.', 'Closed.', 'Good result.'],
      sleep: ['Off shift.', 'On hold.', 'Meeting with myself…', 'Out of office.', 'Recharging.'],
    },
  },
  geek: {
    label: 'Geek',
    lines: {
      idle: ['while(true) idle();', 'await user.input()', 'What are we compiling?', 'ping… pong?', '> _'],
      thinking: ['Compiling ideas…', 'Loading… 42%', 'git blame brain', 'Searching Stack…', 'O(n) thoughts…'],
      working: ['sudo do it', 'npm run magic', 'Hacking the mainframe', 'Writing code…', 'make it so'],
      delegating: ['fork() → {w}', 'spawn({w})', '{w}.run()', 'git push → {w}', '@{w}, assigned to you'],
      happy: ['exit 0', 'Tests are green!', 'Achievement unlocked', '200 OK', 'git commit -m "win"'],
      sleep: ['/dev/null…', 'Hibernate mode', 'sleep(3600)', 'Zzz… 0x7A7A', 'Screensaver ON'],
    },
  },
  granny: {
    label: 'Granny',
    lines: {
      idle: ['Have you eaten, dear?', 'Shall I make you a coffee?', 'Here I am, sweetie.', 'Wrap up, it’s chilly.', 'What do you need, love?'],
      thinking: ['Let me see, let me see…', 'Where are my glasses…', 'This rings a bell…', 'Thinking, sweetheart…', 'Where did I put it?'],
      working: ['Coming, coming.', 'Little by little.', 'The way it used to be done.', 'With care, with care.', 'Almost there.'],
      delegating: ['{w}, dear, help me out.', '{w}, sweetie, could you?', 'Go on, {w}, do me a favor.', '{w}, love, here you go.', '{w}, you know best.'],
      happy: ['That came out lovely!', 'Well done, dear!', 'Oh, what a joy.', 'You deserve a cake!', 'That’s how I like it.'],
      sleep: ['A little nap…', 'Zzz… in the armchair.', 'Nodding off…', 'Zzz… with the TV on.', 'Resting my eyes…'],
    },
  },
}
