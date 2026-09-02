/**
 * Fetches an Electron-ABI `better_sqlite3.node` without disturbing the
 * Node-ABI build in `node_modules`.
 *
 * `better-sqlite3` is the only native addon in the project, and Electron's Node
 * is a different NODE_MODULE_VERSION than the Node the repo targets (Electron
 * 42 is ABI 146; Node 22 is 127), so one binary cannot serve both. Anything
 * that rebuilds in place — `@electron/rebuild` pointed at the repo, a
 * postinstall hook, or electron-builder's `npmRebuild` — breaks `npm test` and
 * `next dev` until it is rebuilt back.
 *
 * So the Electron addon is fetched into a throwaway staging tree and copied to
 * `native/<platform>-<arch>/`. `lib/meta-db.ts` loads it through
 * better-sqlite3's `nativeBinding` option, which bypasses `require('bindings')`
 * entirely; `node_modules` stays at the Node ABI forever.
 *
 * `prebuild-install` downloads an official prebuilt binary, so no compiler
 * toolchain is needed. Note the Electron version is pinned deliberately:
 * better-sqlite3 publishes prebuilds only up to Electron 42 (ABI 146), and
 * 12.x cannot compile against Electron 43+/Node 24's newer V8 headers.
 *
 * Cached on (sqlite version, electron version, platform, arch): re-running is a
 * no-op, so this only costs anything after an upgrade.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const sqliteVersion = require('better-sqlite3/package.json').version
const electronVersion = require('electron/package.json').version
const platform = process.env.PGSTUDIO_NATIVE_PLATFORM || process.platform
const arch = process.env.PGSTUDIO_NATIVE_ARCH || process.arch

const outputDir = join(repoRoot, 'native', `${platform}-${arch}`)
const outputFile = join(outputDir, 'better_sqlite3.node')
const stampFile = join(outputDir, 'build-info.json')
const stamp = { sqliteVersion, electronVersion, platform, arch }

function isFresh() {
  if (!existsSync(outputFile) || !existsSync(stampFile)) return false
  try {
    const previous = JSON.parse(readFileSync(stampFile, 'utf8'))
    return Object.entries(stamp).every(([key, value]) => previous[key] === value)
  } catch {
    return false
  }
}

if (isFresh()) {
  console.log(
    `better_sqlite3.node up to date (better-sqlite3 ${sqliteVersion}, electron ${electronVersion}, ${platform}-${arch})`
  )
  process.exit(0)
}

const stagingDir = join(repoRoot, '.desktop-native', `${platform}-${arch}-electron${electronVersion}`)
rmSync(stagingDir, { recursive: true, force: true })
mkdirSync(stagingDir, { recursive: true })
writeFileSync(
  join(stagingDir, 'package.json'),
  JSON.stringify(
    {
      name: 'pgstudio-native-staging',
      version: '0.0.0',
      private: true,
      dependencies: { 'better-sqlite3': sqliteVersion },
    },
    null,
    2
  )
)

// --ignore-scripts: skip the Node-ABI build; the Electron one is fetched below.
console.log(`staging better-sqlite3@${sqliteVersion} in ${stagingDir}`)
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: stagingDir,
  stdio: 'inherit',
})

const moduleDir = join(stagingDir, 'node_modules', 'better-sqlite3')

/**
 * Use the staging tree's own `prebuild-install`, not the repo's. Both bundle
 * `node-abi`, and the repo's hoisted copy is an old transitive version that
 * does not know recent Electron releases; the freshly installed staging copy
 * does. This also keeps the script independent of the repo's transitive deps.
 */
function resolvePrebuildInstall() {
  const candidates = [
    join(stagingDir, 'node_modules', 'prebuild-install', 'bin.js'),
    join(moduleDir, 'node_modules', 'prebuild-install', 'bin.js'),
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    console.error(`could not find prebuild-install in ${stagingDir}`)
    process.exit(1)
  }
  return found
}

console.log(`fetching prebuilt addon for electron ${electronVersion} (${platform}-${arch})`)
execFileSync(
  process.execPath,
  [
    resolvePrebuildInstall(),
    '--runtime',
    'electron',
    '--target',
    electronVersion,
    '--platform',
    platform,
    '--arch',
    arch,
  ],
  { cwd: moduleDir, stdio: 'inherit' }
)

const built = join(moduleDir, 'build', 'Release', 'better_sqlite3.node')
if (!existsSync(built)) {
  console.error(
    [
      `No prebuilt better_sqlite3.node for electron ${electronVersion} (${platform}-${arch}).`,
      'better-sqlite3 publishes Electron prebuilds only up to Electron 42 (ABI 146);',
      'newer Electron majors would need a source build against Node 24 V8 headers.',
    ].join('\n')
  )
  process.exit(1)
}

mkdirSync(outputDir, { recursive: true })
copyFileSync(built, outputFile)
writeFileSync(stampFile, JSON.stringify(stamp, null, 2))
rmSync(stagingDir, { recursive: true, force: true })
console.log(`wrote ${outputFile}`)
