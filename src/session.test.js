import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSession } from './session.js'

test('session and camp are requested together', async () => {
  const started = []
  const request = (path) => {
    started.push(path)
    if (path === '/api/me') {
      return new Promise((resolve) => setTimeout(() => resolve({ user: { id: 'u_1', username: '林间' } }), 40))
    }
    return new Promise((resolve) => setTimeout(() => resolve({ store: { pine: 1 } }), 10))
  }
  const pending = loadSession(request)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(started, ['/api/me', '/api/state'])
  const data = await pending
  assert.equal(data.user.username, '林间')
  assert.equal(data.store.pine, 1)
})

test('a signed-out session does not surface a second rejection', async () => {
  const request = (path) => {
    if (path === '/api/me') {
      const error = new Error('请先登录')
      error.status = 401
      return Promise.reject(error)
    }
    return new Promise((_, reject) => {
      const error = new Error('请先登录')
      error.status = 401
      setTimeout(() => reject(error), 20)
    })
  }
  await assert.rejects(loadSession(request), (error) => error.status === 401)
  await new Promise((resolve) => setTimeout(resolve, 30))
})
