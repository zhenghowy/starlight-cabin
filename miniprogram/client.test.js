const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { once } = require('node:events')
const { createCabin } = require('./utils/cabin.js')

function memoryStorage() {
  let state = null
  return {
    read() {
      return state ? JSON.parse(JSON.stringify(state)) : null
    },
    write(next) {
      state = JSON.parse(JSON.stringify(next))
    }
  }
}

async function startServer() {
  const { createApp } = await import('../server/app.js')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-mp-'))
  const app = createApp({ dataDir, cookieSecure: false })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const calls = []
  return {
    dataDir,
    calls,
    base,
    async close() {
      server.close()
      await once(server, 'close')
    },
    request: async ({ path: urlPath, method, body, sid }) => {
      calls.push(`${method || 'GET'} ${urlPath}`)
      const res = await fetch(base + urlPath, {
        method: method || 'GET',
        headers: Object.assign({ 'content-type': 'application/json' }, sid ? { cookie: `sid=${sid}` } : {}),
        body: body ? JSON.stringify(body) : undefined
      })
      const text = await res.text()
      let json = {}
      try {
        json = text ? JSON.parse(text) : {}
      } catch (err) {
        json = {}
      }
      const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
      const header = res.headers.get('set-cookie') || ''
      let next = sid || ''
      for (const item of cookies.concat(header)) {
        const part = String(item).split(';')[0].trim()
        if (part.startsWith('sid=')) next = part.slice(4)
      }
      return { status: res.status, body: json, sid: next }
    }
  }
}

test('miniprogram project is the real app id and not a web-view', async () => {
  const root = __dirname
  const project = fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')
  const appJson = fs.readFileSync(path.join(root, 'app.json'), 'utf8')
  const packed = fs.readdirSync(root, { recursive: true }).map(String)
  const sources = packed
    .filter((name) => !name.endsWith('client.test.js'))
    .filter((name) => name.endsWith('.js') || name.endsWith('.json') || name.endsWith('.wxml'))
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
    .join('\n')
  assert.match(project, /wx68ff89d7295d60ce/)
  assert.equal(project.includes('wxa93871210ae14151'), false)
  assert.equal(sources.includes('web-view'), false)
  assert.equal(sources.includes('AppSecret'), false)
  assert.match(project, /"urlCheck": true/)
  assert.match(appJson, /修行时间/)
  assert.match(fs.readFileSync(path.join(root, 'pages/board/board.wxml'), 'utf8'), /不是现在的实时排名/)
  const { renderGame, renderOps } = await import('../scripts/emit-miniprogram-shared.mjs')
  assert.equal(fs.readFileSync(path.join(root, 'utils/game.js'), 'utf8'), renderGame())
  assert.equal(fs.readFileSync(path.join(root, 'utils/ops.js'), 'utf8'), renderOps())
})

test('local cabin survives restart, waits seven days, and keeps conflicts', async () => {
  const server = await startServer()
  const storage = memoryStorage()
  let online = true
  const first = createCabin({
    storage,
    request: server.request,
    online: async () => online
  })
  try {
    await first.signIn('小林', 'secret12', true)
    assert.equal(first.view().pineCones, 0)
    assert.equal(JSON.stringify(storage.read()).includes('secret12'), false)
    const syncsAfterLogin = server.calls.filter((line) => line.includes('/api/sync')).length
    assert.equal(syncsAfterLogin >= 1, true)
    online = false
    const restarted = createCabin({
      storage,
      request: () => {
        throw new Error('不应该联网')
      },
      online: async () => false
    })
    assert.equal(restarted.view().username, '小林')
    const skipped = await restarted.catchUp()
    assert.equal(skipped.skipped, true)
    for (const id of ['t1', 't2', 't3', 't4', 't5', 't6', 't7']) restarted.checkIn(id)
    assert.equal(restarted.view().pineCones, 30)
    restarted.redeem('s1')
    assert.equal(restarted.view().pineCones, 0)
    restarted.addTask({ name: '熬夜一杯', type: 'study', reward: -6, minutes: '' })
    const custom = restarted.view().tasks.find((task) => task.name === '熬夜一杯')
    restarted.checkIn(custom.id)
    assert.equal(restarted.view().pineCones, -6)
    assert.equal(restarted.view().sync.pending, 10)
    assert.equal(server.calls.filter((line) => line.includes('/api/sync')).length, syncsAfterLogin)

    online = true
    const quiet = createCabin({ storage, request: server.request, online: async () => true })
    const notDue = await quiet.catchUp()
    assert.equal(notDue.skipped, true)
    assert.equal(server.calls.filter((line) => line.includes('/api/sync')).length, syncsAfterLogin)

    quiet.debugSetLastSync(8)
    const caught = await quiet.catchUp()
    assert.equal(caught.ok, true)
    assert.equal(quiet.view().pineCones, -6)
    assert.equal(quiet.view().sync.pending, 0)
    const saveFile = fs.readdirSync(path.join(server.dataDir, 'saves'))[0]
    const saved = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'saves', saveFile), 'utf8'))
    assert.equal(saved.user_profile.pine_cones, -6)

    const replayId = saved.sync_ops[0]
    const raw = storage.read()
    raw.accounts[quiet.view().userId].pending.push({ id: replayId, type: 'checkin', taskId: 't1' })
    storage.write(raw)
    const replay = createCabin({ storage, request: server.request, online: async () => true })
    const replayed = await replay.sync(true)
    assert.equal(replayed.ok, true)
    assert.equal(replay.view().pineCones, -6)

    const sid = storage.read().secrets[replay.view().userId]
    const removed = await fetch(`${server.base}/api/tasks/t8`, { method: 'DELETE', headers: { cookie: `sid=${sid}` } })
    assert.equal(removed.status, 200)
    replay.checkIn('t8')
    assert.equal(replay.view().pineCones, -2)
    const conflicted = await replay.sync(true)
    assert.equal(conflicted.ok, true)
    assert.equal(replay.view().pineCones, -6)
    assert.equal(replay.view().sync.conflicts.length >= 1, true)
    assert.match(replay.view().boardText, /^\d{4}-\d{2}-\d{2}/)
    assert.equal(replay.view().board.length > 0, true)
    assert.equal(replay.view().boardAt > 0, true)

    const other = await fetch(`${server.base}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `sid=${sid}` },
      body: JSON.stringify({
        ops: [{ id: 'op_second_device_t2_once', type: 'checkin', taskId: 't2' }],
        store: { user_profile: { pine_cones: 999999 } }
      })
    }).then((res) => res.json())
    assert.equal(other.store.user_profile.pine_cones, -6)
    assert.equal(other.conflicts.some((item) => item.id === 'op_second_device_t2_once'), true)

    replay.logout()
    await replay.signIn('小乙', 'secret34', true)
    assert.equal(replay.view().username, '小乙')
    assert.equal(replay.view().pineCones, 0)
    assert.equal(replay.view().tasks.some((task) => task.name === '熬夜一杯'), false)
    replay.logout()
    await replay.signIn('小林', 'secret12', false)
    assert.equal(replay.view().pineCones, -6)
    assert.equal(replay.view().sync.conflicts.length >= 1, true)

    fs.writeFileSync(path.join(server.dataDir, 'sessions.json'), JSON.stringify({ sessions: [] }))
    const expired = await replay.sync(true)
    assert.equal(expired.ok, false)
    assert.equal(replay.view().pineCones, -6)
    assert.equal(replay.view().sync.authExpired, true)
    const backup = replay.exportBackup()
    assert.equal(JSON.stringify(backup).includes(sid), false)
    assert.equal(backup.pending !== undefined, true)
  } finally {
    await server.close()
  }
})
