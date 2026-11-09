import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyStore } from './game.js'
import { applyOp, foldPending } from './ops.js'

function checkin(taskId, id = `op_${taskId}`) {
  return { id, type: 'checkin', taskId }
}

test('negative check-in deducts once and replays cleanly', () => {
  let store = emptyStore(new Date('2026-11-09T02:00:00Z'))
  const added = applyOp(store, {
    id: 'op_add_neg',
    type: 'add-task',
    entityId: 'task_neg',
    name: '熬夜',
    taskType: 'routine',
    reward: -4
  })
  assert.equal(added.ok, true)
  store = added.store
  const once = applyOp(store, checkin('task_neg', 'op_neg'))
  assert.equal(once.ok, true)
  assert.equal(once.store.user_profile.pine_cones, -4)
  const again = applyOp(once.store, checkin('task_neg', 'op_neg_2'))
  assert.equal(again.ok, false)
  assert.equal(again.conflict, 'already-done')
  assert.equal(again.store.user_profile.pine_cones, -4)
})

test('fold keeps later ops when an earlier one conflicts', () => {
  const store = emptyStore(new Date('2026-11-09T02:00:00Z'))
  const folded = foldPending(store, [
    checkin('missing', 'op_missing'),
    checkin('t1', 'op_ok')
  ])
  assert.equal(folded.conflicts.length, 1)
  assert.equal(folded.conflicts[0].conflict, 'missing-task')
  assert.equal(folded.store.user_profile.pine_cones, 5)
})

test('remove is idempotent and does not resurrect a deleted task', () => {
  const store = emptyStore(new Date('2026-11-09T02:00:00Z'))
  const removed = applyOp(store, { id: 'op_rm', type: 'remove-task', taskId: 't1' })
  assert.equal(removed.ok, true)
  assert.equal(removed.store.tasks.some((task) => task.id === 't1'), false)
  const check = applyOp(removed.store, checkin('t1', 'op_after'))
  assert.equal(check.ok, false)
  assert.equal(check.conflict, 'missing-task')
})
