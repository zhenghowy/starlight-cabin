const game = require('./game.js')
const ops = require('./ops.js')

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function emptyState() {
  return { activeId: '', accounts: {}, secrets: {} }
}

function stamp(ms) {
  if (!ms) return '还没有成功同步过'
  const shifted = new Date(ms + 8 * 60 * 60 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())} ${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`
}

function shouldAutoSync(lastSyncAt, now, online, hasUser) {
  if (!hasUser || !online || !lastSyncAt) return false
  return now - lastSyncAt >= WEEK_MS
}

function createCabin({ storage, request, now = () => new Date(), online = async () => true, onChange = () => {} }) {
  let state = emptyState()
  let syncing = null

  function persist() {
    const saved = clone(state)
    storage.write(saved)
    onChange()
  }

  function restore() {
    const loaded = storage.read()
    state = loaded && typeof loaded === 'object' ? loaded : emptyState()
    if (!state.accounts) state.accounts = {}
    if (!state.secrets) state.secrets = {}
    if (!state.activeId) state.activeId = ''
  }

  function active() {
    return state.accounts[state.activeId] || null
  }

  function secret() {
    return state.secrets[state.activeId] || ''
  }

  function ensureAccount(userId, username) {
    if (!state.accounts[userId]) {
      state.accounts[userId] = {
        username,
        store: game.emptyStore(now()),
        pending: [],
        conflicts: [],
        lastSyncAt: 0,
        lastError: '',
        authExpired: false,
        board: [],
        boardAt: 0
      }
    }
    return state.accounts[userId]
  }

  function adoptLogin(user, store, sid) {
    const account = ensureAccount(user.id, user.username)
    account.username = user.username
    const pending = account.pending || []
    if (!pending.length) {
      account.store = game.normalize(store, now())
      account.lastSyncAt = now().getTime()
      account.boardAt = account.boardAt || 0
    }
    account.authExpired = false
    account.lastError = ''
    state.activeId = user.id
    state.secrets[user.id] = sid
    persist()
  }

  function rememberError(message, authExpired) {
    const account = active()
    if (!account) return
    account.lastError = message
    if (authExpired) account.authExpired = true
    persist()
  }

  async function sync(manual) {
    if (syncing) return syncing
    syncing = runSync(manual).finally(() => {
      syncing = null
    })
    return syncing
  }

  async function runSync(manual) {
    const account = active()
    if (!account) return { ok: false, error: '请先登录', status: 401 }
    const onlineNow = await online()
    if (!manual && !shouldAutoSync(account.lastSyncAt, now().getTime(), onlineNow, true)) {
      return { ok: true, skipped: true }
    }
    if (!onlineNow) {
      if (!manual) return { ok: true, skipped: true }
      return { ok: false, error: '现在没有网络，记录还在手机里' }
    }
    const sid = secret()
    if (!sid) {
      rememberError('需要重新登录才能同步，本机记录还在', true)
      return { ok: false, error: '需要重新登录才能同步，本机记录还在', status: 401 }
    }
    let result
    try {
      result = await request({
        path: '/api/sync',
        method: 'POST',
        body: { ops: (account.pending || []).slice(0, 40) },
        sid
      })
    } catch (err) {
      if (err && err.offline) {
        rememberError('同步没有完成，记录还在手机里', false)
        return { ok: false, error: '同步没有完成，记录还在手机里' }
      }
      const message = (err && err.message) || '同步没有完成，记录还在手机里'
      rememberError(message, false)
      return { ok: false, error: message }
    }
    if (result.status === 401) {
      rememberError('登录过期了，本机记录还在', true)
      return { ok: false, error: '登录过期了，本机记录还在', status: 401 }
    }
    if (result.status !== 200 || !result.body || !result.body.store) {
      rememberError('同步没有完成，记录还在手机里', false)
      return { ok: false, error: (result.body && result.body.error) || '同步没有完成，记录还在手机里', status: result.status }
    }
    const acked = new Set(result.body.acked || [])
    const serverConflicts = result.body.conflicts || []
    const conflictIds = new Set(serverConflicts.map((item) => item.id))
    account.pending = (account.pending || []).filter((op) => !acked.has(op.id) && !conflictIds.has(op.id))
    for (const item of serverConflicts) {
      account.conflicts = (account.conflicts || []).filter((row) => row.id !== item.id)
      account.conflicts.push({ id: item.id, error: item.message || '这条和服务器对不上，还留在手机里' })
    }
    let store = game.normalize(result.body.store, now())
    if (account.pending.length) {
      const folded = ops.foldPending(store, account.pending, now())
      store = folded.store
      const foldedIds = new Set(folded.conflicts.map((item) => item.id))
      account.pending = account.pending.filter((op) => !foldedIds.has(op.id))
      for (const item of folded.conflicts) {
        account.conflicts.push({ id: item.id, error: item.message || '这条和服务器对不上，还留在手机里' })
      }
    }
    account.store = store
    account.lastSyncAt = now().getTime()
    account.lastError = ''
    account.authExpired = false
    account.board = result.body.board || []
    account.boardAt = account.lastSyncAt
    if (result.sid) state.secrets[state.activeId] = result.sid
    persist()
    return { ok: true }
  }

  async function catchUp() {
    return sync(false)
  }

  async function signIn(username, password, register) {
    let result
    try {
      result = await request({
        path: register ? '/api/register' : '/api/login',
        method: 'POST',
        body: { username, password },
        sid: ''
      })
    } catch (err) {
      if (!err || !err.offline) throw err
      const error = new Error('森林暂时连不上。第一次登录需要网络。')
      error.status = 0
      throw error
    }
    if (result.status !== 200 && result.status !== 201) {
      const error = new Error((result.body && result.body.error) || '账号或密码不对')
      error.status = result.status
      throw error
    }
    if (!result.sid || !result.body.user || !result.body.store) {
      const error = new Error('没有拿到登录凭证')
      error.status = 500
      throw error
    }
    adoptLogin(result.body.user, result.body.store, result.sid)
    try {
      await sync(true)
    } catch (err) {
      // 登录已经把营地放进本机。同步失败不取消登录。
    }
    return view()
  }

  function logout() {
    const id = state.activeId
    if (id) delete state.secrets[id]
    state.activeId = ''
    persist()
    return { ok: true, pending: id && state.accounts[id] ? state.accounts[id].pending.length : 0 }
  }

  function mutate(op) {
    const account = active()
    if (!account) {
      const error = new Error('请先登录')
      error.status = 401
      throw error
    }
    const applied = ops.applyOp(account.store, op, now())
    if (!applied.ok) {
      const error = new Error(applied.message || '没有记下这条')
      error.status = 400
      throw error
    }
    if (!(account.pending || []).some((item) => item.id === op.id)) account.pending.push(op)
    account.store = applied.store
    persist()
    return applied
  }

  function checkIn(taskId) {
    return mutate({ id: ops.opId(), type: 'checkin', taskId })
  }

  function addTask(input) {
    return mutate({
      id: ops.opId(),
      type: 'add-task',
      entityId: ops.entityId('t'),
      name: input.name,
      taskType: input.type,
      reward: input.reward,
      minutes: input.minutes
    })
  }

  function removeTask(taskId) {
    return mutate({ id: ops.opId(), type: 'remove-task', taskId })
  }

  function addShop(input) {
    return mutate({
      id: ops.opId(),
      type: 'add-shop',
      entityId: ops.entityId('s'),
      name: input.name,
      cost: input.cost,
      minutes: input.minutes
    })
  }

  function removeShop(itemId) {
    return mutate({ id: ops.opId(), type: 'remove-shop', itemId })
  }

  function redeem(itemId) {
    return mutate({ id: ops.opId(), type: 'redeem', itemId })
  }

  function exportBackup() {
    const account = active()
    if (!account) return { ok: false, error: '还没有营地' }
    return {
      ok: true,
      user: { id: state.activeId, username: account.username },
      store: clone(account.store),
      pending: clone(account.pending || []),
      conflicts: clone(account.conflicts || []),
      exportedAt: now().getTime()
    }
  }

  function debugSetLastSync(daysAgo) {
    const account = active()
    if (!account) return
    account.lastSyncAt = now().getTime() - daysAgo * 24 * 60 * 60 * 1000
    persist()
  }

  function view() {
    const account = active()
    if (!account) {
      return {
        authed: false,
        sync: { pending: 0, conflicts: [], lastSyncText: stamp(0), lastError: '', authExpired: false }
      }
    }
    const home = game.presentHome(account.store, now())
    const shop = game.presentShop(home.store)
    const log = game.presentLog(home.store, now())
    return {
      authed: true,
      userId: state.activeId,
      username: account.username,
      pineCones: home.pineCones,
      greeting: home.greeting,
      levelWord: home.levelWord,
      attrs: home.attrs,
      scene: home.scene,
      tasks: home.tasks.map((task) => ({
        id: task.id,
        name: task.name,
        type: task.type,
        color: game.ATTR_META[task.type].color,
        done: task.is_completed,
        rewardLine: game.formatConeLine(task.reward_cones, task.minutes),
        negative: task.reward_cones < 0
      })),
      doneCount: home.doneCount,
      taskCount: home.tasks.length,
      shopItems: shop.items.map((item) => ({
        id: item.id,
        name: item.name,
        cost: item.cost,
        costLine: item.cost < 0 ? `退回 ${Math.abs(item.cost)} 枚` : `${item.cost} 枚`,
        affordable: item.affordable
      })),
      log: {
        totalDays: log.totalDays,
        streak: log.streak,
        monthTotal: log.monthTotal,
        poem: log.poem,
        grid: log.grid
      },
      board: account.board || [],
      boardAt: account.boardAt || 0,
      boardText: stamp(account.boardAt),
      sync: {
        pending: (account.pending || []).length,
        conflicts: account.conflicts || [],
        lastSyncAt: account.lastSyncAt || 0,
        lastSyncText: stamp(account.lastSyncAt),
        lastError: account.lastError || '',
        authExpired: !!account.authExpired
      }
    }
  }

  function boardEntry(id) {
    const account = active()
    const entries = account ? account.board || [] : []
    return entries.find((item) => item.id === id) || null
  }

  restore()

  return {
    restore,
    view,
    boardEntry,
    signIn,
    logout,
    sync,
    catchUp,
    checkIn,
    addTask,
    removeTask,
    addShop,
    removeShop,
    redeem,
    exportBackup,
    debugSetLastSync,
    shouldAutoSync
  }
}

module.exports = { createCabin, shouldAutoSync, WEEK_MS }
