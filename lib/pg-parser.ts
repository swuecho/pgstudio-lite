import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PG_VERSION = 17
const WASM_DIR = path.join(process.cwd(), 'node_modules', '@pgsql/parser', 'wasm', `v${PG_VERSION}`)

type WasmModule = {
  _malloc: (size: number) => number
  _free: (ptr: number) => void
  _wasm_parse_query_raw: (queryPtr: number) => number
  _wasm_free_parse_result: (resultPtr: number) => void
  getValue: (ptr: number, type: string) => number
  UTF8ToString: (ptr: number) => string
  stringToUTF8: (str: string, ptr: number, maxBytes: number) => void
  lengthBytesUTF8: (str: string) => number
}

let wasmModule: WasmModule | undefined
let initPromise: Promise<void> | undefined

async function loadWasmModule(): Promise<WasmModule> {
  if (wasmModule) return wasmModule
  if (!initPromise) {
    initPromise = (async () => {
      const libpgQueryUrl = pathToFileURL(path.join(WASM_DIR, 'libpg-query.js')).href
      const initPgQuery = (await import(/* webpackIgnore: true */ libpgQueryUrl)).default as (options?: {
        locateFile?: (file: string) => string
      }) => Promise<WasmModule>
      wasmModule = await initPgQuery({
        locateFile: (file) => path.join(WASM_DIR, file),
      })
    })()
  }
  await initPromise
  if (!wasmModule) throw new Error('Failed to initialize PostgreSQL parser WASM module')
  return wasmModule
}

function stringToPtr(module: WasmModule, str: string): number {
  const len = module.lengthBytesUTF8(str) + 1
  const ptr = module._malloc(len)
  try {
    module.stringToUTF8(str, ptr, len)
    return ptr
  } catch (error) {
    module._free(ptr)
    throw error
  }
}

export async function parseSql(
  query: string
): Promise<{ stmts?: Array<{ stmt: unknown; stmt_location?: number; stmt_len?: number }> }> {
  if (query === null || query === undefined) {
    throw new Error('Query cannot be null or undefined')
  }
  if (typeof query !== 'string') {
    throw new Error(`Query must be a string, got ${typeof query}`)
  }
  if (query.trim() === '') {
    throw new Error('Query cannot be empty')
  }

  const module = await loadWasmModule()
  const queryPtr = stringToPtr(module, query)
  let resultPtr = 0
  try {
    resultPtr = module._wasm_parse_query_raw(queryPtr)
    if (!resultPtr) {
      throw new Error('Failed to allocate memory for parse result')
    }

    const parseTreePtr = module.getValue(resultPtr, 'i32')
    const errorPtr = module.getValue(resultPtr + 8, 'i32')

    if (errorPtr) {
      const messagePtr = module.getValue(errorPtr, 'i32')
      const message = messagePtr ? module.UTF8ToString(messagePtr) : 'Unknown error'
      throw new Error(message)
    }

    if (!parseTreePtr) {
      throw new Error('Parse result is null')
    }

    const parseTree = module.UTF8ToString(parseTreePtr)
    return JSON.parse(parseTree)
  } finally {
    module._free(queryPtr)
    if (resultPtr) {
      module._wasm_free_parse_result(resultPtr)
    }
  }
}
