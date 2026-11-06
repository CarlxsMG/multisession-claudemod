// What the `/crew` command answers. The engine shows it as the command's output
// and stores it in the conversation, where the model reads it, so it is English
// whatever the UI speaks. A name goes in as the person wrote it.

/** Each answer of `/crew`: `help` for a verb it does not take, the rest for the verb they follow. */
export const crewReply = {
  help: `/crew                  opens the pane
/crew team             every worker, one to a row
/crew edit             customize your mascot
/crew msg <worker> <text>
/crew code             copies your mascot's code
/crew import <code>
/crew random           a random mascot (keeps its name and phrase)
/crew mode on|off      the orchestrator delegates on its own, or not
/crew clear            takes the finished workers off the pane
/crew progress         how the workers are doing, now
/crew progress 1m|2m|3m|5m|10m|off   how often it says so by itself`,
  opened: (name: string) => `${name}'s pane is open.`,
  editing: (name: string) => `Customizing ${name}.`,
  teamOpened: (name: string) => `${name}'s crew is open.`,
  msgUsage: 'Usage: /crew msg <worker> <text>',
  sent: (name: string) => `Message sent to ${name}.`,
  code: (name: string, isCopied: boolean, code: string) => `${name}'s code${isCopied ? ' (copied)' : ''}:\n${code}`,
  badCode: 'That code is not valid (it starts with CREW1.).',
  imported: (name: string) => `Hi, ${name}! Mascot imported.`,
  newLook: (name: string) => `${name} has a new look.`,
  modeOn: (name: string) => `${name} will delegate to workers.`,
  modeOff: (name: string) => `${name} will work without delegating.`,
  cleared: 'The finished workers are off the pane.',
  progressUsage: 'Usage: /crew progress [1m|2m|3m|5m|10m|off]',
}
