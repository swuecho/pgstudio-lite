import { z } from 'zod'

const inputOptionSchema = z.object({
  label: z.string(),
  value: z.string().min(1),
})

const inputMetadataSchema = z.object({
  key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1),
  inputType: z.enum(['text', 'number', 'date', 'datetime-local', 'checkbox', 'select', 'range', 'multiselect']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(inputOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  autoRun: z.boolean().optional(),
})

const baseCellSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['sql', 'markdown', 'input']),
  position: z.number().int().min(0).optional(),
  collapsed: z.boolean().optional(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const notebookSpecV1Schema = z
  .object({
    spec_version: z.literal('1.0'),
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    description: z.string().optional(),
    connection_name: z.string().trim().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    cells: z.array(baseCellSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    for (let i = 0; i < value.cells.length; i += 1) {
      const cell = value.cells[i]
      if (seen.has(cell.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cells', i, 'id'],
          message: 'cell id must be unique',
        })
      }
      seen.add(cell.id)
      if (cell.type === 'input') {
        const parsed = inputMetadataSchema.safeParse(cell.metadata)
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['cells', i, 'metadata', ...issue.path],
              message: issue.message,
            })
          }
        }
      }
      if (cell.type === 'sql' && !cell.content.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cells', i, 'content'],
          message: 'SQL cell content cannot be empty',
        })
      }
    }
  })

export const importNotebookSchema = z.object({
  mode: z.enum(['create', 'replace', 'upsert']).optional().default('create'),
  target_notebook_id: z.string().trim().min(1).optional(),
  notebook: notebookSpecV1Schema,
  validate_only: z.boolean().optional().default(false),
})

export const patchNotebookSchema = z.object({
  spec_version: z.literal('1.0'),
  ops: z
    .array(
      z.object({
        op: z.enum(['add', 'remove', 'replace']),
        path: z.string().startsWith('/'),
        value: z.unknown().optional(),
      })
    )
    .min(1),
})

function decodePointerToken(token: string) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

function getPathTokens(path: string) {
  if (!path.startsWith('/')) {
    throw new Error(`invalid JSON pointer path: ${path}`)
  }
  return path
    .slice(1)
    .split('/')
    .map((part) => decodePointerToken(part))
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readContainerAndKey(root: unknown, path: string) {
  const tokens = getPathTokens(path)
  if (tokens.length === 0) throw new Error('root path operations are not supported')
  let target = root as Record<string, unknown> | unknown[]
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const key = tokens[i]
    if (Array.isArray(target)) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= target.length) {
        throw new Error(`array path not found: ${path}`)
      }
      target = target[index] as Record<string, unknown> | unknown[]
      continue
    }

    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      throw new Error(`object path not found: ${path}`)
    }
    target = (target as Record<string, unknown>)[key] as Record<string, unknown> | unknown[]
  }

  return { container: target, key: tokens[tokens.length - 1] }
}

function setAtPath(root: unknown, path: string, value: unknown, mode: 'add' | 'replace') {
  const { container, key } = readContainerAndKey(root, path)
  if (Array.isArray(container)) {
    if (key === '-' && mode === 'add') {
      container.push(value)
      return
    }
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index > container.length) {
      throw new Error(`invalid array index for path: ${path}`)
    }
    if (mode === 'replace') {
      if (index >= container.length) throw new Error(`array index not found for replace: ${path}`)
      container[index] = value
      return
    }
    container.splice(index, 0, value)
    return
  }

  const objectContainer = container as Record<string, unknown>
  if (mode === 'replace' && !Object.prototype.hasOwnProperty.call(objectContainer, key)) {
    throw new Error(`object key not found for replace: ${path}`)
  }
  objectContainer[key] = value
}

function removeAtPath(root: unknown, path: string) {
  const { container, key } = readContainerAndKey(root, path)
  if (Array.isArray(container)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= container.length) {
      throw new Error(`array index not found for remove: ${path}`)
    }
    container.splice(index, 1)
    return
  }
  const objectContainer = container as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(objectContainer, key)) {
    throw new Error(`object key not found for remove: ${path}`)
  }
  delete objectContainer[key]
}

export function applyJsonPatch<T>(input: T, ops: Array<{ op: 'add' | 'remove' | 'replace'; path: string; value?: unknown }>): T {
  const out = cloneJson(input)
  for (const patch of ops) {
    if (patch.op === 'remove') {
      removeAtPath(out, patch.path)
      continue
    }
    setAtPath(out, patch.path, patch.value, patch.op)
  }
  return out
}

export function formatZodIssuesAsApiDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: `/${issue.path.map((part) => String(part)).join('/')}`,
    message: issue.message,
  }))
}
