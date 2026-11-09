import fs from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')

function exportedNames(source) {
  const names = []
  for (const match of source.matchAll(/^export function ([A-Za-z0-9_]+)/gm)) names.push(match[1])
  for (const match of source.matchAll(/^export const ([A-Za-z0-9_]+)/gm)) names.push(match[1])
  return names
}

export function renderGame() {
  const source = fs.readFileSync(path.join(root, 'shared/game.js'), 'utf8')
  const names = exportedNames(source)
  const body = source.replace(/^export /gm, '')
  return `${body}\nmodule.exports = { ${names.join(', ')} }\n`
}

export function renderOps() {
  const source = fs.readFileSync(path.join(root, 'shared/ops.js'), 'utf8')
  const names = exportedNames(source)
  const body = source
    .replace(
      /import \{([^}]+)\} from '\.\/game\.js'\n/,
      'const {$1} = require("./game.js")\n'
    )
    .replace(/^export /gm, '')
  return `${body}\nmodule.exports = { ${names.join(', ')} }\n`
}

export function writeShared(dir = path.join(root, 'miniprogram/utils')) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'game.js'), renderGame())
  fs.writeFileSync(path.join(dir, 'ops.js'), renderOps())
}

if (import.meta.url === `file://${process.argv[1]}`) writeShared()
