import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { once } from 'node:events'
import { createApp } from './app.js'

async function start() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-sync-'))
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

async function login(base, username) {
  const res = await fetch(`${base}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'pinecone' })
  })
  const data = await res.json()
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  const raw = setCookie[0] || res.headers.get('set-cookie') || ''
  return { status: res.status, data, cookie: raw.split(';')[0] }
}

async function sync(base, cookie, ops) {
  const res = await fetch(`${base}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ops, store: { user_profile: { pine_cones: 999999 } } })
  })
  return { status: res.status, data: await res.json() }
}

test('sync is idempotent and ignores a client balance', async () => {
  const ctx = await start()
  try {
    const a = await login(ctx.base, '小林')
    const op = { id: 'op_once', type: 'checkin', taskId: 't1' }
    const first = await sync(ctx.base, a.cookie, [op])
    assert.equal(first.status, 200)
    assert.deepEqual(first.data.acked, ['op_once'])
    assert.equal(first.data.store.user_profile.pine_cones, 5)
    const [again, parallel] = await Promise.all([
      sync(ctx.base, a.cookie, [op]),
      sync(ctx.base, a.cookie, [op])
    ])
    assert.equal(again.data.store.user_profile.pine_cones, 5)
    assert.equal(parallel.data.store.user_profile.pine_cones, 5)
    assert.equal(again.data.store.sync_ops, undefined)
  } finally {
    await ctx.close()
  }
})

test('web edits survive a later device sync and conflicts stay visible', async () => {
  const ctx = await start()
  try {
    const a = await login(ctx.base, '小乙')
    const removed = await fetch(`${ctx.base}/api/tasks/t2`, { method: 'DELETE', headers: { Cookie: a.cookie } })
    assert.equal(removed.status, 200)
    const pushed = await sync(ctx.base, a.cookie, [
      { id: 'op_web_conflict', type: 'checkin', taskId: 't2' },
      { id: 'op_other', type: 'checkin', taskId: 't3' }
    ])
    assert.equal(pushed.data.conflicts[0].conflict, 'missing-task')
    assert.equal(pushed.data.acked.includes('op_other'), true)
    assert.equal(pushed.data.store.user_profile.pine_cones, 5)
    const b = await login(ctx.base, '小丙')
    const stolen = await sync(ctx.base, b.cookie, [{ id: 'op_steal', type: 'checkin', taskId: 't1' }])
    const still = await sync(ctx.base, a.cookie, [])
    assert.equal(stolen.data.store.user_profile.pine_cones, 5)
    assert.equal(still.data.store.user_profile.pine_cones, 5)
    const denied = await sync(ctx.base, 'sid=nope', [{ id: 'op_nope', type: 'checkin', taskId: 't4' }])
    assert.equal(denied.status, 401)
    const after = await sync(ctx.base, a.cookie, [])
    assert.equal(after.data.store.user_profile.pine_cones, 5)
  } finally {
    await ctx.close()
  }
})

test('negative coin op is applied once', async () => {
  const ctx = await start()
  try {
    const a = await login(ctx.base, '小丁')
    const added = await sync(ctx.base, a.cookie, [{
      id: 'op_add_neg',
      type: 'add-task',
      entityId: 'task_neg',
      name: '熬夜',
      taskType: 'routine',
      reward: -6
    }])
    assert.equal(added.data.acked.includes('op_add_neg'), true)
    const spent = await sync(ctx.base, a.cookie, [{ id: 'op_spend', type: 'checkin', taskId: 'task_neg' }])
    assert.equal(spent.data.store.user_profile.pine_cones, -6)
    const replay = await sync(ctx.base, a.cookie, [{ id: 'op_spend', type: 'checkin', taskId: 'task_neg' }])
    assert.equal(replay.data.store.user_profile.pine_cones, -6)
  } finally {
    await ctx.close()
  }
})
