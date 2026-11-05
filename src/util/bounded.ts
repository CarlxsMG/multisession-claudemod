// Lists and maps kept to their newest entries: what the crew records grows
// with every call and message, and only the latest entries are ever read.

/**
 * `list` with `items` appended and cut to its newest `max`. With `keyOf`, an
 * older entry with the key of one appended is dropped first.
 */
export function appendKept<T>(list: readonly T[], items: readonly T[], max: number, keyOf?: (x: T) => string): T[] {
  if (keyOf === undefined) return [...list, ...items].slice(-max)
  const keys = new Set(items.map(keyOf))
  return [...list.filter(x => !keys.has(keyOf(x))), ...items].slice(-max)
}

/** Sets `key` in `map` as its newest entry, and drops the oldest past `max`. */
export function setKept<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
  map.delete(key)
  map.set(key, value)
  for (const old of map.keys()) {
    if (map.size <= max) break
    map.delete(old)
  }
}
