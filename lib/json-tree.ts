export type JsonContainerKind = 'object' | 'array'

export function containerKind(value: unknown): JsonContainerKind | null {
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object' && value !== null) return 'object'
  return null
}

/** Children of a container as `[key, value]`; array indices become string keys. */
export function entriesOf(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item])
  return Object.entries(value as Record<string, unknown>)
}

/** Every container path in the tree, used by expand-all. */
export function collectContainerPaths(value: unknown, path: string, out: string[]): string[] {
  if (!containerKind(value)) return out
  out.push(path)
  for (const [key, child] of entriesOf(value)) collectContainerPaths(child, `${path}/${key}`, out)
  return out
}

export function summarizeContainer(value: unknown, kind: JsonContainerKind): string {
  const count = entriesOf(value).length
  if (kind === 'array') return count === 1 ? '1 item' : `${count} items`
  return count === 1 ? '1 key' : `${count} keys`
}

/** A scalar the way it is written in JSON, which is also how it is edited. */
export function scalarText(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

/**
 * The inverse of {@link scalarText}: valid JSON becomes that value (so `12`,
 * `true`, `null`, `{}` all work), anything else stays the literal text.
 */
export function parseScalarInput(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return text
  }
}

function cloneContainer(container: unknown): unknown {
  return Array.isArray(container) ? [...container] : { ...(container as Record<string, unknown>) }
}

/** Immutably replaces the node at `path`; an empty path replaces the root. */
export function setAtPath(root: unknown, path: string[], next: unknown): unknown {
  if (path.length === 0) return next
  const [key, ...rest] = path
  if (Array.isArray(root)) {
    const copy = [...root]
    const index = Number(key)
    copy[index] = setAtPath(copy[index], rest, next)
    return copy
  }
  const copy = { ...(root as Record<string, unknown>) }
  copy[key] = setAtPath(copy[key], rest, next)
  return copy
}

export function getAtPath(root: unknown, path: string[]): unknown {
  return path.reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, root)
}

function updateContainer(root: unknown, path: string[], update: (container: unknown) => unknown): unknown {
  const container = getAtPath(root, path)
  if (!containerKind(container)) return root
  return setAtPath(root, path, update(cloneContainer(container)))
}

export function removeAtPath(root: unknown, parentPath: string[], key: string): unknown {
  return updateContainer(root, parentPath, (container) => {
    if (Array.isArray(container)) {
      const copy = [...container]
      copy.splice(Number(key), 1)
      return copy
    }
    const copy = container as Record<string, unknown>
    delete copy[key]
    return copy
  })
}

/** Renames an object key in place, so the tree does not reshuffle while editing. */
export function renameKeyAtPath(
  root: unknown,
  parentPath: string[],
  oldKey: string,
  newKey: string
): unknown {
  if (oldKey === newKey) return root
  return updateContainer(root, parentPath, (container) => {
    if (Array.isArray(container)) return container
    const source = container as Record<string, unknown>
    const renamed: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(source)) {
      if (key === newKey) continue
      renamed[key === oldKey ? newKey : key] = value
    }
    return renamed
  })
}

/** A key that does not collide with the container's existing keys. */
export function nextAvailableKey(container: Record<string, unknown>, base = 'key'): string {
  if (!(base in container)) return base
  let index = 2
  while (`${base}${index}` in container) index += 1
  return `${base}${index}`
}

/** Appends `null` to a container and returns the new tree plus the new key. */
export function addEntryAtPath(root: unknown, parentPath: string[]): { root: unknown; key: string } | null {
  const container = getAtPath(root, parentPath)
  const kind = containerKind(container)
  if (!kind) return null
  if (kind === 'array') {
    const source = container as unknown[]
    const key = String(source.length)
    return { root: setAtPath(root, parentPath, [...source, null]), key }
  }
  const source = container as Record<string, unknown>
  const key = nextAvailableKey(source)
  return { root: setAtPath(root, parentPath, { ...source, [key]: null }), key }
}
