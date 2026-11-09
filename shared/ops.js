import { addShopItem, addTask, checkIn, checkInToast, isStableId, redeem, refreshDaily, removeShopItem, removeTask } from './game.js'

const CONFLICTS = {
  'bad-op': '这条记录不完整，不能同步',
  'already-done': '这件小事在服务器上已经打过卡',
  'missing-task': '这件小事在服务器上已经不在了',
  exists: '同编号的记录已经在服务器上',
  poor: '服务器上的松果不够完成这次兑换',
  'missing-item': '这件心愿在服务器上已经不在了',
  name: '名字没有通过服务器校验',
  long: '名字太长，服务器没有收下',
  type: '事项类型没有通过服务器校验'
}

export function opId() {
  const bytes = new Uint8Array(16)
  const root = typeof globalThis === 'undefined' ? {} : globalThis
  const crypto = root.crypto
  if (crypto && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return `op_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function entityId(prefix) {
  return `${prefix}${opId().slice(3, 19)}`
}

function reject(conflict, store) {
  return { ok: false, conflict, message: CONFLICTS[conflict] || CONFLICTS['bad-op'], store }
}

/**
 * 把一条带编号的操作套到存档上。不接受客户端直接报来的余额。
 * 同一条操作能否重复入账，由调用方用 op.id 决定。
 */
export function applyOp(store, op, now = new Date()) {
  if (!op || !isStableId(op.id)) return reject('bad-op', store)
  const base = refreshDaily(store, now)
  if (op.type === 'checkin') {
    if (!isStableId(op.taskId)) return reject('bad-op', base)
    const result = checkIn(base, op.taskId, now)
    if (!result) {
      const exists = base.tasks.some((task) => task.id === op.taskId)
      return reject(exists ? 'already-done' : 'missing-task', base)
    }
    return { ok: true, store: result.store, message: checkInToast(result) }
  }
  if (op.type === 'add-task') {
    if (!isStableId(op.entityId)) return reject('bad-op', base)
    if (base.tasks.some((task) => task.id === op.entityId)) return reject('exists', base)
    const result = addTask(base, op.name, op.taskType, op.reward, now, op.minutes, op.entityId)
    if (!result.ok) return reject(result.reason || 'bad-op', base)
    return { ok: true, store: result.store }
  }
  if (op.type === 'remove-task') {
    if (!isStableId(op.taskId)) return reject('bad-op', base)
    return { ok: true, store: removeTask(base, op.taskId) }
  }
  if (op.type === 'add-shop') {
    if (!isStableId(op.entityId)) return reject('bad-op', base)
    if (base.shop_items.some((item) => item.id === op.entityId)) return reject('exists', base)
    const result = addShopItem(base, op.name, op.cost, now, op.minutes, op.entityId)
    if (!result.ok) return reject(result.reason || 'bad-op', base)
    return { ok: true, store: result.store }
  }
  if (op.type === 'remove-shop') {
    if (!isStableId(op.itemId)) return reject('bad-op', base)
    return { ok: true, store: removeShopItem(base, op.itemId) }
  }
  if (op.type === 'redeem') {
    if (!isStableId(op.itemId)) return reject('bad-op', base)
    const result = redeem(base, op.itemId)
    if (!result.ok) return reject(result.reason === 'poor' ? 'poor' : 'missing-item', base)
    return { ok: true, store: result.store }
  }
  return reject('bad-op', base)
}

export function foldPending(store, ops, now = new Date()) {
  let current = store
  const conflicts = []
  for (const op of ops || []) {
    const result = applyOp(current, op, now)
    if (result.ok) current = result.store
    else conflicts.push({ id: op.id, message: result.message, conflict: result.conflict })
  }
  return { store: current, conflicts }
}

export function publicStore(store) {
  if (!store) return store
  const copy = JSON.parse(JSON.stringify(store))
  delete copy.sync_ops
  return copy
}
