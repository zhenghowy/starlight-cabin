import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { once } from 'node:events'
import { createApp } from './app.js'

async function start(options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-'))
  const app = createApp({ dataDir, cookieSecure: false, maxUsers: options.maxUsers || 20, allowRegister: options.allowRegister !== false })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    dataDir,
    async close() {
      server.close()
      await once(server, 'close')
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  }
}

async function json(base, urlPath, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + urlPath, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json()
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  const raw = setCookie[0] || res.headers.get('set-cookie') || ''
  const sid = raw.split(';')[0]
  return { status: res.status, data, cookie: sid }
}

test('register, login, and keep saves apart', async () => {
  const ctx = await start()
  try {
    const a = await json(ctx.base, '/api/register', {
      method: 'POST',
      body: { username: '林间', password: 'pinecone' }
    })
    assert.equal(a.status, 201)
    assert.equal(a.data.user.username, '林间')
    assert.equal(a.data.store.user_profile.pine_cones, 0)
    assert.ok(a.cookie.startsWith('sid='))

    const me = await json(ctx.base, '/api/me', { cookie: a.cookie })
    assert.equal(me.status, 200)
    assert.equal(me.data.user.username, '林间')

    const checked = await json(ctx.base, '/api/checkin', {
      method: 'POST',
      cookie: a.cookie,
      body: { taskId: 't1' }
    })
    assert.equal(checked.status, 200)
    assert.equal(checked.data.store.user_profile.pine_cones, 5)
    assert.match(checked.data.toast, /秩序 \+5/)

    const b = await json(ctx.base, '/api/register', {
      method: 'POST',
      body: { username: '小松鼠', password: 'acorn-1' }
    })
    assert.equal(b.status, 201)
    assert.equal(b.data.store.user_profile.pine_cones, 0)

    const aAgain = await json(ctx.base, '/api/state', { cookie: a.cookie })
    assert.equal(aAgain.data.store.user_profile.pine_cones, 5)
    assert.equal(aAgain.data.store.tasks.find((t) => t.id === 't1').is_completed, true)

    const files = fs.readdirSync(path.join(ctx.dataDir, 'saves'))
    assert.equal(files.length, 2)

    const dup = await json(ctx.base, '/api/register', {
      method: 'POST',
      body: { username: '林间', password: 'another1' }
    })
    assert.equal(dup.status, 409)

    const bad = await json(ctx.base, '/api/login', {
      method: 'POST',
      body: { username: '林间', password: 'wrong-pass' }
    })
    assert.equal(bad.status, 401)

    const back = await json(ctx.base, '/api/login', {
      method: 'POST',
      body: { username: '林间', password: 'pinecone' }
    })
    assert.equal(back.status, 200)
    assert.equal(back.data.store.user_profile.pine_cones, 5)

    const out = await json(ctx.base, '/api/logout', { method: 'POST', cookie: back.cookie })
    assert.equal(out.status, 200)
    const gone = await json(ctx.base, '/api/me', { cookie: back.cookie })
    assert.equal(gone.status, 401)
  } finally {
    await ctx.close()
  }
})

test('shop redeem and custom wishes stay on that account', async () => {
  const ctx = await start()
  try {
    const a = await json(ctx.base, '/api/register', {
      method: 'POST',
      body: { username: 'camper', password: 'secret1' }
    })
    const poor = await json(ctx.base, '/api/redeem', {
      method: 'POST',
      cookie: a.cookie,
      body: { itemId: 's1' }
    })
    assert.equal(poor.status, 400)
    assert.equal(poor.data.reason, 'poor')

    for (const id of ['t1', 't2', 't3', 't4', 't5', 't6', 't7']) {
      const done = await json(ctx.base, '/api/checkin', {
        method: 'POST',
        cookie: a.cookie,
        body: { taskId: id }
      })
      assert.equal(done.status, 200)
    }

    const bought = await json(ctx.base, '/api/redeem', {
      method: 'POST',
      cookie: a.cookie,
      body: { itemId: 's1' }
    })
    assert.equal(bought.status, 200)
    assert.equal(bought.data.store.user_profile.pine_cones, 0)
    assert.match(bought.data.message, /你值得这份温柔/)

    const wish = await json(ctx.base, '/api/shop', {
      method: 'POST',
      cookie: a.cookie,
      body: { name: '一封写给自己的信', cost: '12' }
    })
    assert.equal(wish.status, 201)
    assert.equal(wish.data.store.shop_items.at(-1).cost, 12)

    const planted = await json(ctx.base, '/api/tasks', {
      method: 'POST',
      cookie: a.cookie,
      body: { name: '散步十分钟', type: 'fitness' }
    })
    assert.equal(planted.status, 201)
    const task = planted.data.store.tasks.at(-1)
    assert.equal(task.name, '散步十分钟')
    assert.equal(task.reward_cones, 3)

    const removed = await json(ctx.base, `/api/tasks/${task.id}`, { method: 'DELETE', cookie: a.cookie })
    assert.equal(removed.status, 200)
    assert.equal(removed.data.store.tasks.some((t) => t.id === task.id), false)

    const anon = await json(ctx.base, '/api/state')
    assert.equal(anon.status, 401)
  } finally {
    await ctx.close()
  }
})

test('board is login-only and hides secrets', async () => {
  const ctx = await start()
  try {
    const locked = await json(ctx.base, '/api/board')
    assert.equal(locked.status, 401)

    const a = await json(ctx.base, '/api/register', {
      method: 'POST',
      body: { username: '林甲', password: 'secret1' }
    })
    assert.equal(a.status, 201)
    await json(ctx.base, '/api/checkin', { method: 'POST', cookie: a.cookie, body: { taskId: 't1' } })
    const b = await json(ctx.base, '/api/register', {
      method: 'POST',
      body: { username: '林乙', password: 'secret2' }
    })
    assert.equal(b.status, 201)

    const board = await json(ctx.base, '/api/board', { cookie: b.cookie })
    assert.equal(board.status, 200)
    assert.equal(board.data.entries.length, 2)
    const blob = JSON.stringify(board.data)
    assert.equal(blob.includes('password'), false)
    assert.equal(blob.includes('scrypt'), false)
    assert.equal(blob.includes('热可可'), false)
    const leader = board.data.entries[0]
    assert.equal(leader.username, '林甲')
    assert.equal(leader.pineCones, 5)
    assert.equal(leader.todayDone, 1)
    assert.equal(leader.recentTasks[0].name.includes('月亮'), true)

    const detail = await json(ctx.base, `/api/board/${a.data.user.id}`, { cookie: b.cookie })
    assert.equal(detail.status, 200)
    assert.equal(detail.data.entry.rank, 1)
    assert.ok(detail.data.entry.scene)
    assert.equal(JSON.stringify(detail.data).includes('secret'), false)

    const missing = await json(ctx.base, '/api/board/u_deadbeef', { cookie: b.cookie })
    assert.equal(missing.status, 404)
  } finally {
    await ctx.close()
  }
})
