import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { once } from 'node:events'
import { createApp } from './app.js'

test('hashed assets stay cached and private responses do not', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-static-'))
  const dataDir = path.join(root, 'data')
  const distDir = path.join(root, 'dist')
  const publicDir = path.join(root, 'public')
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true })
  fs.mkdirSync(publicDir, { recursive: true })
  fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log(1)\n')
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>小屋</title>')
  const app = createApp({ dataDir, distDir, publicDir, cookieSecure: false })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const asset = await fetch(base + '/assets/index-abc123.js')
    assert.equal(asset.status, 200)
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    const html = await fetch(base + '/login')
    assert.equal(html.status, 200)
    assert.match(html.headers.get('cache-control') || '', /no-cache/)
    assert.equal((await html.text()).includes('小屋'), true)
    const me = await fetch(base + '/api/me')
    assert.equal(me.status, 401)
    assert.match(me.headers.get('cache-control') || '', /no-store/)
  } finally {
    server.close()
    await once(server, 'close')
    fs.rmSync(root, { recursive: true, force: true })
  }
})
