// A tool call's input as a model sent it: any field may be missing or of
// another type, so each is read into the type the crew uses.

/** A tool call: its tool's name and whatever its input holds. */
export type ToolCall = { tool: string } & Record<string, unknown>

/** The field `key` of `input`. */
export const fieldOf = (input: object, key: string): unknown => Reflect.get(input, key)

/** The field `key` of `input`, trimmed when it is a string, else ''. */
export function stringArg(input: object, key: string): string {
  const value = fieldOf(input, key)
  return typeof value === 'string' ? value.trim() : ''
}

/** The field `key` of `input` as sent when it is a string. */
export function rawStringArg(input: object, key: string): string | undefined {
  const value = fieldOf(input, key)
  return typeof value === 'string' ? value : undefined
}
