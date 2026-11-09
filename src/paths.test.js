import assert from 'node:assert/strict'
import test from 'node:test'
import { historyPath, normalizePath } from './paths.js'

test('android asset paths still open the cabin screens', () => {
  assert.equal(normalizePath('/cabin/index.html'), '/')
  assert.equal(normalizePath('/cabin/shop'), '/shop')
  assert.equal(normalizePath('/login'), '/login')
  assert.equal(normalizePath('/board/u_abc123'), '/board/u_abc123')
  assert.equal(historyPath('/shop', true), '/cabin/shop')
  assert.equal(historyPath('/', true), '/cabin/index.html')
  assert.equal(historyPath('/login', false), '/login')
})
