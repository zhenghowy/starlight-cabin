import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { once } from 'node:events'
import { createApp } from './app.js'
import { APK_NAME, APK_PATH, APK_SHA256 } from '../shared/apk.js'

async function start() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-apk-'))
  const app = createApp({ dataDir, cookieSecure: false })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.close()
      await once(server, 'close')
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  }
}

function walk(dir) {
  const files = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

test('public directory publishes only the cabin apk', () => {
  const root = path.join(process.cwd(), 'public')
  const files = walk(root).map((file) => path.relative(root, file))
  assert.ok(files.includes(path.join('downloads', APK_NAME)))
  for (const file of files) {
    assert.equal(/\.(jks|env)$/i.test(file), false, file)
    assert.equal(file.toLowerCase().includes('keystore'), false, file)
  }
  const apk = fs.readFileSync(path.join(root, 'downloads', APK_NAME))
  assert.equal(createHash('sha256').update(apk).digest('hex'), APK_SHA256)
})

test('apk route downloads the sideload package and hides the signing key', async () => {
  const ctx = await start()
  try {
    const res = await fetch(ctx.base + APK_PATH)
    const buf = Buffer.from(await res.arrayBuffer())
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/vnd.android.package-archive')
    assert.match(res.headers.get('content-disposition') || '', new RegExp(`filename="${APK_NAME.replaceAll('.', '\\.')}"`))
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(createHash('sha256').update(buf).digest('hex'), APK_SHA256)
    assert.equal(buf.length, 591456)

    const head = await fetch(ctx.base + APK_PATH, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('content-type'), 'application/vnd.android.package-archive')

    for (const secretPath of ['/android/keystore/starlight-cabin-sideload.jks', '/android/keystore.properties', '/keystore.properties']) {
      const hidden = await fetch(ctx.base + secretPath)
      const body = Buffer.from(await hidden.arrayBuffer())
      assert.notEqual(body.subarray(0, 4).toString('hex'), 'feedfeed', secretPath)
      assert.equal(body.includes(Buffer.from('storePassword=')), false, secretPath)
      assert.equal(body.includes(Buffer.from('keyPassword=')), false, secretPath)
    }
  } finally {
    await ctx.close()
  }
})
