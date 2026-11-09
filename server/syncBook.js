import { applyOp, publicStore } from '../shared/ops.js'

const OP_LIMIT = 40

export function createSyncBook(repo) {
  return {
    async push(userId, ops, now = new Date()) {
      const list = Array.isArray(ops) ? ops.slice(0, OP_LIMIT) : []
      const acked = []
      const conflicts = []
      let latest = null
      for (const op of list) {
        let outcome = null
        latest = await repo.updateSave(userId, (current) => {
          const seen = new Set(Array.isArray(current.sync_ops) ? current.sync_ops : [])
          if (op && typeof op.id === 'string' && seen.has(op.id)) {
            outcome = { ack: true }
            return current
          }
          const applied = applyOp(current, op, now)
          if (!applied.ok) {
            outcome = { conflict: applied.conflict, message: applied.message }
            return current
          }
          const next = applied.store
          next.sync_ops = [...seen, op.id].slice(-2000)
          outcome = { ack: true }
          return next
        })
        if (outcome?.ack) acked.push(op.id)
        else {
          conflicts.push({
            id: op && typeof op.id === 'string' ? op.id : '',
            conflict: outcome?.conflict || 'bad-op',
            message: outcome?.message || '不能同步'
          })
        }
      }
      if (!latest) latest = await repo.readSave(userId)
      return { acked, conflicts, store: publicStore(refreshCopy(latest)) }
    }
  }
}

function refreshCopy(store) {
  return publicStore(store)
}
