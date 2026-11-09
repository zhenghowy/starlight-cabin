import { refreshDaily } from '@shared/game.js'
import { applyOp, entityId, foldPending, opId } from '@shared/ops.js'
import { ApiError } from './api.js'

export function isCabinApp() {
  return typeof window !== 'undefined' && window.CabinNative && typeof window.CabinNative.bootstrap === 'function'
}

function read(method, ...args) {
  const raw = window.CabinNative[method](...args)
  return JSON.parse(raw)
}

function fail(data) {
  const error = new ApiError(data.error || '没有完成', data.status || 400, data)
  throw error
}

export function loadNative() {
  const data = read('bootstrap')
  if (!data.user || !data.store) {
    const error = new ApiError('请先登录', 401, null)
    throw error
  }
  let store = refreshDaily(data.store)
  if (!data.needsReplay && JSON.stringify(store) !== JSON.stringify(data.store)) {
    window.CabinNative.replaceSnapshot(JSON.stringify(store))
  }
  if (data.needsReplay) {
    const folded = foldPending(store, data.pending || [])
    store = folded.store
    for (const conflict of folded.conflicts) {
      window.CabinNative.markConflict(conflict.id, conflict.message || '和服务器对不上')
    }
    window.CabinNative.replaceSnapshot(JSON.stringify(store))
  }
  return { user: data.user, store, meta: data }
}

export function nativeLogin(username, password, mode) {
  const data = read(mode === 'register' ? 'register' : 'login', username, password)
  if (!data.ok) fail(data)
  return loadNative()
}

export function nativeLogout() {
  return read('logout')
}

export function nativeMeta() {
  return read('meta')
}

export function nativeSync() {
  const data = read('syncNow')
  if (!data.ok) fail(data)
  return loadNative()
}

export function nativeExport() {
  return read('exportBackup')
}

export function nativeMutate(url, options, store) {
  const method = options?.method || 'GET'
  const body = options?.body || {}
  if (method === 'GET' && (url === '/api/state' || url === '/api/me')) {
    const loaded = loadNative()
    if (url === '/api/me') return { user: loaded.user }
    return { user: loaded.user, store: loaded.store }
  }
  if (method === 'GET' && (url === '/api/board' || url.startsWith('/api/board/'))) {
    const meta = nativeMeta()
    const entries = meta.board || []
    if (url === '/api/board') {
      return { entries, syncedAt: meta.boardAt, stale: true }
    }
    const id = url.slice('/api/board/'.length)
    const entry = entries.find((item) => item.id === id)
    if (!entry) {
      const error = new ApiError('这片林子里没有这位朋友', 404, null)
      throw error
    }
    return { entry, syncedAt: meta.boardAt, stale: true }
  }
  const op = opFor(url, method, body)
  const applied = applyOp(store, op)
  if (!applied.ok) fail({ error: applied.message, status: 400, reason: applied.conflict })
  const saved = read('commit', JSON.stringify({ op, store: applied.store }))
  if (!saved.ok) fail(saved)
  return { store: applied.store, toast: applied.message || '' }
}

function opFor(url, method, body) {
  if (url === '/api/checkin' && method === 'POST') {
    return { id: opId(), type: 'checkin', taskId: body.taskId }
  }
  if (url === '/api/tasks' && method === 'POST') {
    return {
      id: opId(),
      type: 'add-task',
      entityId: entityId('t'),
      name: body.name,
      taskType: body.type,
      reward: body.reward,
      minutes: body.minutes
    }
  }
  if (url.startsWith('/api/tasks/') && method === 'DELETE') {
    return { id: opId(), type: 'remove-task', taskId: decodeURIComponent(url.slice('/api/tasks/'.length)) }
  }
  if (url === '/api/shop' && method === 'POST') {
    return {
      id: opId(),
      type: 'add-shop',
      entityId: entityId('s'),
      name: body.name,
      cost: body.cost,
      minutes: body.minutes
    }
  }
  if (url.startsWith('/api/shop/') && method === 'DELETE') {
    return { id: opId(), type: 'remove-shop', itemId: decodeURIComponent(url.slice('/api/shop/'.length)) }
  }
  if (url === '/api/redeem' && method === 'POST') {
    return { id: opId(), type: 'redeem', itemId: body.itemId }
  }
  const error = new ApiError('离线时还不能做这件事', 400, null)
  throw error
}
