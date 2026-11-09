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

async function withoutIntl(fn) {
  const descriptor = Object.getOwnPropertyDescriptor(global, 'Intl')
  Object.defineProperty(global, 'Intl', { value: undefined, configurable: true, writable: true })
  try {
    assert.equal(typeof Intl, 'undefined')
    await fn()
  } finally {
    if (descriptor) Object.defineProperty(global, 'Intl', descriptor)
    else delete global.Intl
  }
}

test('dates, import, log, board and sync work without Intl', async () => {
  const game = require('./utils/game.js')
  const { createCabin } = require('./utils/cabin.js')
  await withoutIntl(async () => {
    assert.equal(game.today(new Date('2026-11-02T16:30:00.000Z')), '2026-11-03')
    assert.equal(game.today(new Date('2026-11-02T15:30:00.000Z')), '2026-11-02')
    const store = game.emptyStore(new Date('2026-11-02T16:30:00.000Z'))
    store.user_profile.pine_cones = -486
    const home = game.presentHome(store, new Date('2026-11-02T16:30:00.000Z'))
    assert.equal(home.pineCones, -486)
    const log = game.presentLog(store, new Date('2026-11-02T16:30:00.000Z'))
    assert.equal(typeof log.poem, 'string')
    assert.equal(log.grid.length > 0, true)
    const activity = game.presentActivity(store, new Date('2026-11-02T16:30:00.000Z'))
    assert.equal(activity.pineCones, -486)
    assert.equal(typeof game.compareActivity({ username: '小林', totalLevel: 1, streak: 0, pineCones: 0 }, { username: '小乙', totalLevel: 1, streak: 0, pineCones: 0 }), 'number')

    const storage = memoryStorage()
    storage.write({
      activeId: 'u_old',
      accounts: {
        u_old: {
          username: '小林',
          store,
          pending: [{ id: 'op_keep', type: 'checkin', taskId: 't1' }],
          conflicts: [{ id: 'op_old', error: '还留着' }],
          lastSyncAt: Date.now(),
          lastError: '',
          authExpired: false,
          board: [],
          boardAt: 0
        }
      },
      secrets: { u_old: 'sid-keep' }
    })
    const kept = createCabin({
      storage,
      request: async () => {
        throw Object.assign(new Error('不应该在未到期时联网'), { offline: false })
      },
      online: async () => true
    })
    assert.equal(kept.view().pineCones, -486)
    assert.equal(kept.view().sync.pending, 1)
    assert.equal(kept.view().sync.conflicts[0].error, '还留着')
    assert.equal(kept.view().log.grid.length > 0, true)
    const skipped = await kept.catchUp()
    assert.equal(skipped.skipped, true)
    assert.equal(storage.read().secrets.u_old, 'sid-keep')
    assert.equal(storage.read().accounts.u_old.pending[0].id, 'op_keep')

    const fresh = memoryStorage()
    const imported = createCabin({
      storage: fresh,
      request: async ({ path }) => {
        if (path === '/api/login') {
          return {
            status: 200,
            sid: 'sid-new',
            body: { user: { id: 'u_new', username: '小林' }, store }
          }
        }
        if (path === '/api/sync') {
          return { status: 200, sid: 'sid-new', body: { acked: [], conflicts: [], store, board: [{ id: 'u_new', username: '小林', rank: 1, pineCones: -486 }] } }
        }
        throw new Error(`意外请求 ${path}`)
      },
      online: async () => true
    })
    const view = await imported.signIn('小林', 'secret12', false)
    assert.equal(view.pineCones, -486)
    assert.equal(view.sync.pending, 0)
    assert.equal(view.board[0].pineCones, -486)
    assert.match(view.boardText, /^\d{4}-\d{2}-\d{2}/)
    assert.equal(fresh.read().secrets.u_new, 'sid-new')
  })
})

test('compatibility failures stay distinct from network failures', async () => {
  const { createCabin } = require('./utils/cabin.js')
  const storage = memoryStorage()
  const broken = createCabin({
    storage,
    request: async () => {
      throw new Error('Intl is not defined')
    },
    online: async () => true
  })
  await assert.rejects(() => broken.signIn('小林', 'secret12', false), (err) => {
    assert.equal(err.message, 'Intl is not defined')
    assert.equal(err.message.includes('连不上'), false)
    return true
  })
  const offline = createCabin({
    storage: memoryStorage(),
    request: async () => {
      const error = new Error('request:fail')
      error.offline = true
      throw error
    },
    online: async () => false
  })
  await assert.rejects(() => offline.signIn('小林', 'secret12', false), /森林暂时连不上/)

  const saved = memoryStorage()
  const cabin = createCabin({
    storage: saved,
    request: async ({ path }) => {
      if (path === '/api/login') {
        return {
          status: 200,
          sid: 'sid-keep',
          body: { user: { id: 'u_keep', username: '小林' }, store: require('./utils/game.js').emptyStore() }
        }
      }
      throw new TypeError('Intl is not defined')
    },
    online: async () => true
  })
  await cabin.signIn('小林', 'secret12', false)
  cabin.debugSetLastSync(8)
  const result = await cabin.sync(true)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'Intl is not defined')
  assert.equal(result.error.includes('连不上'), false)
  assert.equal(cabin.view().authed, true)
  assert.equal(saved.read().accounts.u_keep.pending.length, 0)
})

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
  const css = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
  assert.match(css, /button\.pill[\s\S]*width:\s*144rpx !important/)
  assert.match(css, /button\.hit-check[\s\S]*width:\s*88rpx !important/)
  assert.match(css, /\.pill-face[\s\S]*height:\s*44rpx/)
  assert.match(css, /flex-wrap:\s*nowrap/)
  assert.match(css, /word-break:\s*break-word/)
  const home = fs.readFileSync(path.join(root, 'pages/home/home.wxml'), 'utf8')
  assert.match(home, /class="row-actions"/)
  assert.match(home, /class="hit-check"/)
  assert.equal(home.split('bindtap="onCheckIn"').length - 1, 1)
  assert.match(fs.readFileSync(path.join(root, 'utils/session.js'), 'utf8'), /cabin-state/)
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
