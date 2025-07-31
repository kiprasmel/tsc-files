#!/usr/bin/env node

const { spawnSync } = require("child_process")
const fs = require("fs")
const { dirname, join } = require("path")

const resolveFromModule = (moduleName, ...paths) => {
  const modulePath = dirname(require.resolve(`${moduleName}/package.json`))
  return join(modulePath, ...paths)
}

const resolveFromRoot = (...paths) => {
  return join(process.cwd(), ...paths)
}

const args = process.argv.slice(2)

const argsProjectIndex = args.findIndex(arg => ["-p", "--project"].includes(arg))

const argsProjectValue = argsProjectIndex !== -1 ? args[argsProjectIndex + 1] : undefined

const files = args.filter(file => /\.(ts|tsx)$/.test(file))
if (files.length === 0) {
  process.exit(0)
}

const remainingArgsToForward = args.slice().filter(arg => !files.includes(arg))

if (argsProjectIndex !== -1) {
  remainingArgsToForward.splice(argsProjectIndex, 2)
}

// Load existing config
const tsconfigPath = argsProjectValue || resolveFromRoot("tsconfig.json")

/**
 * write a temp config file.
 * previously, the name used to be random,
 * but this obviously invalidates cache / incrememental builds,
 * and makes things an order of magnitude slower.
 * so, static it is.
 */
const TMP_CONFIG_FILE = "tsconfig.temp.json"
const tmpTsconfigPath = resolveFromRoot(TMP_CONFIG_FILE)
const tmpTsconfig = {
  extends: tsconfigPath,
  files,
}
fs.writeFileSync(tmpTsconfigPath, JSON.stringify(tmpTsconfig, null, 2))

// Attach cleanup handlers
let didCleanup = false
for (const eventName of ["exit", "SIGHUP", "SIGINT", "SIGTERM"]) {
  process.on(eventName, exitCode => {
    if (didCleanup) return
    didCleanup = true

    fs.unlinkSync(tmpTsconfigPath)

    if (eventName !== "exit") {
      process.exit(exitCode)
    }
  })
}

// Type-check the files
const { status } = spawnSync(
  process.versions.pnp
    ? "tsc"
    : resolveFromModule("typescript", `../.bin/tsc${process.platform === "win32" ? ".cmd" : ""}`),
  ["-p", TMP_CONFIG_FILE, "--skipLibCheck", ...remainingArgsToForward],
  { stdio: "inherit" },
)

process.exit(status)
