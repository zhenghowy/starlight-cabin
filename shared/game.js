/**
 * 星空下的林中小屋 — 玩法与数据模型。
 * 与原小程序 utils/store.js、三个页面的计算保持一致。
 * 纯函数，不碰 wx / localStorage / 文件系统。日期按北京时间。
 */

export const STORAGE_KEY = 'starlight_cabin_store'
export const EXP_PER_LEVEL = 20
export const TIME_ZONE = 'Asia/Shanghai'
export const LEVEL_WORDS = ['一颗种子', '小小嫩芽', '舒展的树', '繁茂的树', '参天巨木']
/** 约定：1 分钟 = 1 枚松果。分钟只负责建议金额，金额仍可另填。 */
export const COINS_PER_MINUTE = 1
export const COIN_MIN = -9999
export const COIN_MAX = 9999
export const BALANCE_MIN = -999999
export const BALANCE_MAX = 999999

export const ATTR_META = {
  study: { name: '学识', icon: '📜', color: '#6B8E6B', source: '林间图书馆' },
  fitness: { name: '能量', icon: '🏃', color: '#D98E73', source: '营地拓展' },
  routine: { name: '秩序', icon: '🌙', color: '#4A6B85', source: '小屋灯光' },
  saving: { name: '储蓄', icon: '🪙', color: '#E8B76B', source: '松果堆' }
}

export const ATTR_TYPES = ['study', 'fitness', 'routine', 'saving']

export const TYPE_SHEET = [
  { type: 'study', label: '学识（学习）' },
  { type: 'fitness', label: '能量（健身）' },
  { type: 'routine', label: '秩序（作息）' },
  { type: 'saving', label: '储蓄（省钱）' }
]

const DEFAULT_TASKS = [
  { id: 't1', name: '向月亮交还意识（23 点前入睡）', type: 'routine', reward_cones: 5, is_completed: false },
  { id: 't2', name: '读几页书，和陌生的思想握个手', type: 'study', reward_cones: 5, is_completed: false },
  { id: 't3', name: '让身体动起来，哪怕是舒展三分钟', type: 'fitness', reward_cones: 5, is_completed: false },
  { id: 't4', name: '把今天的一笔小钱，留给未来的自己', type: 'saving', reward_cones: 5, is_completed: false },
  { id: 't5', name: '写下三行今天的流水账', type: 'study', reward_cones: 3, is_completed: false },
  { id: 't6', name: '喝够一杯温水，照顾好这副身体', type: 'fitness', reward_cones: 3, is_completed: false },
  { id: 't7', name: '在日出前醒来，问候一次清晨', type: 'routine', reward_cones: 4, is_completed: false },
  { id: 't8', name: '忍住一次不必要的消费', type: 'saving', reward_cones: 4, is_completed: false }
]

const DEFAULT_SHOP = [
  { id: 's1', name: '喝一杯热可可', cost: 30 },
  { id: 's2', name: '看一集喜欢的剧', cost: 45 },
  { id: 's3', name: '买一束便宜的鲜花', cost: 60 },
  { id: 's4', name: '周末睡到自然醒', cost: 80 }
]

const WEEKS = 12
let idSeq = 0

function nextId(prefix, now) {
  idSeq += 1
  return `${prefix}${now.getTime().toString(36)}${idSeq.toString(36)}`
}

export function isStableId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}

function stableId(fixedId, prefix, now) {
  return isStableId(fixedId) ? fixedId : nextId(prefix, now)
}

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 北京时间全年 UTC+8，没有夏令时。不使用 Intl，安卓微信里没有这个全局对象。 */
function shanghaiDate(now) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

export function today(now = new Date(), timeZone = TIME_ZONE) {
  if (timeZone === 'Asia/Shanghai') return shanghaiDate(now)
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') return shanghaiDate(now)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const get = (type) => parts.find((p) => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  const p = (x) => String(x).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

export function weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function emptyStore(now = new Date()) {
  return {
    user_profile: {
      pine_cones: 0,
      attributes: {
        study: { level: 1, exp: 0 },
        fitness: { level: 1, exp: 0 },
        routine: { level: 1, exp: 0 },
        saving: { level: 1, exp: 0 }
      }
    },
    tasks: clone(DEFAULT_TASKS),
    shop_items: clone(DEFAULT_SHOP),
    history_logs: [],
    last_open_date: today(now)
  }
}

function healAttr(attr) {
  const level = Math.round(Number(attr?.level))
  const exp = Math.round(Number(attr?.exp))
  return {
    level: Number.isFinite(level) && level >= 1 ? level : 1,
    exp: Number.isFinite(exp) && exp >= 0 ? exp : 0
  }
}

export function normalize(input, now = new Date()) {
  if (!input || !input.user_profile) return emptyStore(now)
  const s = clone(input)
  s.user_profile.pine_cones = clampBalance(s.user_profile.pine_cones)
  s.user_profile.attributes = s.user_profile.attributes || {}
  for (const key of ATTR_TYPES) {
    s.user_profile.attributes[key] = healAttr(s.user_profile.attributes[key])
  }
  if (!Array.isArray(s.tasks)) s.tasks = clone(DEFAULT_TASKS)
  if (!Array.isArray(s.shop_items)) s.shop_items = clone(DEFAULT_SHOP)
  if (!Array.isArray(s.history_logs)) s.history_logs = []
  s.tasks = s.tasks
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && ATTR_META[t.type])
    .map((t) => {
      const task = {
        id: t.id,
        name: String(t.name),
        type: t.type,
        reward_cones: clampReward(t.reward_cones),
        is_completed: !!t.is_completed
      }
      const minutes = clampMinutes(t.minutes)
      if (minutes !== null) task.minutes = minutes
      return task
    })
  s.shop_items = s.shop_items
    .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
    .map((item) => {
      const next = {
        id: item.id,
        name: String(item.name),
        cost: clampCost(item.cost)
      }
      const minutes = clampMinutes(item.minutes)
      if (minutes !== null) next.minutes = minutes
      return next
    })
  if (typeof s.last_open_date !== 'string') s.last_open_date = today(now)
  if (Array.isArray(input.sync_ops)) {
    const ops = input.sync_ops.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 80).slice(-2000)
    if (ops.length) s.sync_ops = ops
  }
  return s
}

function blankAmount(value) {
  if (value === '' || value === null || value === undefined) return true
  return typeof value === 'string' && (value.trim() === '' || value.trim() === '-')
}

/**
 * 把输入收成有限整数。空值用 fallback；超出范围就收到边界。
 * 0 和负数都保留：负数表示放纵或坏习惯。
 */
export function parseSignedInt(value, fallback) {
  if (blankAmount(value)) return fallback
  const n = Math.round(Number(typeof value === 'string' ? value.trim() : value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(COIN_MAX, Math.max(COIN_MIN, n))
}

export function clampBalance(cones) {
  const n = Math.round(Number(cones))
  if (!Number.isFinite(n)) return 0
  return Math.min(BALANCE_MAX, Math.max(BALANCE_MIN, n))
}

export function clampMinutes(minutes) {
  if (blankAmount(minutes)) return null
  return parseSignedInt(minutes, null)
}

export function coinsFromMinutes(minutes) {
  const parsed = clampMinutes(minutes)
  if (parsed === null) return null
  return parseSignedInt(parsed * COINS_PER_MINUTE, parsed)
}

export function clampCost(cost) {
  return parseSignedInt(cost, 0)
}

export function clampReward(reward) {
  return parseSignedInt(reward, 3)
}

export function resolveReward(reward, minutes) {
  const suggested = coinsFromMinutes(minutes)
  if (blankAmount(reward)) return suggested === null ? 3 : suggested
  return parseSignedInt(reward, suggested === null ? 3 : suggested)
}

export function resolveCost(cost, minutes) {
  const suggested = coinsFromMinutes(minutes)
  if (blankAmount(cost)) return suggested === null ? 0 : suggested
  return parseSignedInt(cost, suggested === null ? 0 : suggested)
}

export function formatConeDelta(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n > 0) return `+${n}`
  return String(n)
}

export function formatConeLine(amount, minutes) {
  const coins = `${formatConeDelta(amount)} 松果`
  if (minutes === null || minutes === undefined || minutes === '') return coins
  return `${minutes} 分钟 · ${coins}`
}

/** 表单里没填完的负号不当成数字。空着就返回 undefined，方便省略字段。 */
export function readSignedField(value) {
  if (value === '' || value === '-' || value === null || value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** 输入框里只留一个可选的负号和整数，并收到金币上下限内。 */
export function sanitizeSignedInput(raw) {
  const text = String(raw ?? '')
  const negative = text.replace(/^\s+/, '').startsWith('-')
  const digits = text.replace(/\D/g, '')
  if (!digits) return negative ? '-' : ''
  const n = Math.min(COIN_MAX, Number(digits))
  return `${negative ? '-' : ''}${n}`
}

export function attrProgress(attr) {
  const need = attr.level * EXP_PER_LEVEL
  if (need <= 0) return 0
  return Math.min(1, attr.exp / need)
}

/**
 * 跨天只重置任务完成状态。属性与松果币不扣减。
 */
export function refreshDaily(store, now = new Date()) {
  const s = normalize(store, now)
  const t = today(now)
  if (s.last_open_date !== t) {
    s.tasks.forEach((task) => {
      task.is_completed = false
    })
    s.last_open_date = t
  }
  return s
}

export function checkIn(store, taskId, now = new Date()) {
  const s = normalize(store, now)
  const task = s.tasks.find((x) => x.id === taskId)
  if (!task || task.is_completed) return null

  task.is_completed = true
  const delta = task.reward_cones
  s.user_profile.pine_cones = clampBalance(s.user_profile.pine_cones + delta)

  const attr = s.user_profile.attributes[task.type]
  let leveled = false
  if (delta > 0) {
    attr.exp += delta
    let guard = 0
    while (attr.exp >= attr.level * EXP_PER_LEVEL && guard < 40) {
      attr.exp -= attr.level * EXP_PER_LEVEL
      attr.level += 1
      leveled = true
      guard += 1
    }
  }

  const t = today(now)
  if (!s.history_logs.includes(t)) s.history_logs.push(t)

  return {
    store: s,
    task: { ...task },
    leveled,
    attrName: ATTR_META[task.type].name,
    level: attr.level
  }
}

export function checkInToast(result) {
  if (!result) return ''
  const n = result.task.reward_cones
  if (result.leveled) {
    const word = LEVEL_WORDS[Math.min(4, result.level - 1)]
    return `${result.attrName} 升到 ${result.level} 级了！${word}正在生长`
  }
  if (n < 0) return `放纵记下了，松果币 ${n}`
  if (n === 0) return '记下了，松果币没有变化'
  return `${result.attrName} +${n}，松果币 +${n}`
}

export function redeem(store, itemId) {
  const s = normalize(store)
  const item = s.shop_items.find((x) => x.id === itemId)
  if (!item) return { ok: false }
  if (item.cost > 0 && s.user_profile.pine_cones < item.cost) return { ok: false, reason: 'poor' }
  s.user_profile.pine_cones = clampBalance(s.user_profile.pine_cones - item.cost)
  return { ok: true, store: s, item: { ...item } }
}

export function addShopItem(store, name, cost, now = new Date(), minutes, fixedId) {
  const s = normalize(store, now)
  const trimmed = String(name || '').trim()
  if (!trimmed) return { ok: false, reason: 'name' }
  if (trimmed.length > 40) return { ok: false, reason: 'long' }
  const parsedMinutes = clampMinutes(minutes)
  const item = {
    id: stableId(fixedId, 's', now),
    name: trimmed,
    cost: resolveCost(cost, parsedMinutes)
  }
  if (parsedMinutes !== null) item.minutes = parsedMinutes
  s.shop_items.push(item)
  return { ok: true, store: s }
}

export function removeShopItem(store, id) {
  const s = normalize(store)
  s.shop_items = s.shop_items.filter((x) => x.id !== id)
  return s
}

export function addTask(store, name, type, reward, now = new Date(), minutes, fixedId) {
  const s = normalize(store, now)
  const trimmed = String(name || '').trim()
  if (!ATTR_META[type]) return { ok: false, reason: 'type' }
  if (!trimmed) return { ok: false, reason: 'name' }
  if (trimmed.length > 40) return { ok: false, reason: 'long' }
  const parsedMinutes = clampMinutes(minutes)
  const task = {
    id: stableId(fixedId, 't', now),
    name: trimmed,
    type,
    reward_cones: resolveReward(reward, parsedMinutes),
    is_completed: false
  }
  if (parsedMinutes !== null) task.minutes = parsedMinutes
  s.tasks.push(task)
  return { ok: true, store: s }
}

export function removeTask(store, id) {
  const s = normalize(store)
  s.tasks = s.tasks.filter((x) => x.id !== id)
  return s
}

export function greet(done, total) {
  if (total === 0) return '今天还没有安排，慢慢来。'
  if (done === 0) return '森林在安静地等你，不着急。'
  if (done < total) return `已经完成 ${done} 件了，剩下的随时都行。`
  return '今天的小屋被你点亮了，晚安。'
}

export function presentHome(store, now = new Date()) {
  const s = refreshDaily(store, now)
  const p = s.user_profile
  const attrs = ATTR_TYPES.map((k) => {
    const a = p.attributes[k]
    const meta = ATTR_META[k]
    return {
      key: k,
      name: meta.name,
      icon: meta.icon,
      color: meta.color,
      source: meta.source,
      level: a.level,
      percent: Math.round(attrProgress(a) * 100)
    }
  })
  const done = s.tasks.filter((t) => t.is_completed).length
  const totalLevel = ATTR_TYPES.reduce((sum, k) => sum + p.attributes[k].level, 0)
  const stage = Math.min(4, Math.floor((totalLevel - 4) / 4))
  const scene = {
    treeHeight: 90 + p.attributes.study.level * 26,
    foliage: 60 + p.attributes.study.level * 16,
    lightOpacity: 0.25 + p.attributes.routine.level * 0.15,
    starOpacity: 0.3 + p.attributes.routine.level * 0.12,
    campWidth: 120 + p.attributes.fitness.level * 40,
    cones: Math.min(6, p.attributes.saving.level)
  }
  return {
    store: s,
    pineCones: p.pine_cones,
    attrs,
    tasks: s.tasks,
    doneCount: done,
    totalLevel,
    stage,
    scene,
    levelWord: LEVEL_WORDS[stage],
    greeting: greet(done, s.tasks.length)
  }
}

export function presentShop(store) {
  const s = normalize(store)
  return {
    store: s,
    pineCones: s.user_profile.pine_cones,
    items: s.shop_items.map((item) => ({
      ...item,
      affordable: item.cost <= 0 || s.user_profile.pine_cones >= item.cost
    }))
  }
}

export function poem(days) {
  const bushes = Math.floor(days / 4)
  if (days === 0) return '森林还在等你落下第一笔。不必急，什么时候开始都算数。'
  if (days === 1) return '你迈出了第一步。这片森林记住了。'
  if (days < 7) return `你已经温暖地坚持了 ${days} 天，幼苗刚刚探出头。`
  if (days < 30) return `你已经温暖地坚持了 ${days} 天，这片森林因为有你，多出了 ${bushes} 处灌木丛。`
  if (days < 100) return `你已经温暖地坚持了 ${days} 天，林间的小径被你走出来了，风都认得你。`
  return `你已经温暖地坚持了 ${days} 天。这不再是坚持，这是你生活本来的样子。`
}

export function buildGrid(logSet, todayStr) {
  const end = todayStr
  let start = addDays(end, -(WEEKS * 7 - 1))
  start = addDays(start, -weekday(start))

  const cells = []
  let cur = start
  while (cur <= end || weekday(cur) !== 0) {
    const isFuture = cur > end
    cells.push({
      date: cur,
      lit: !!logSet[cur] && !isFuture,
      future: isFuture,
      day: Number(cur.slice(8, 10)),
      month: Number(cur.slice(5, 7))
    })
    cur = addDays(cur, 1)
    if (cells.length > 200) break
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: '', lit: false, future: true, day: 0, month: 0 })
  }

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push({ days: cells.slice(i, i + 7) })
  }

  let lastMonth = 0
  weeks.forEach((w) => {
    const found = w.days.find((d) => d.month)
    const m = found ? found.month : 0
    w.label = m && m !== lastMonth ? `${m}月` : ''
    if (m) lastMonth = m
  })

  return weeks
}

export function calcStreak(logSet, todayStr) {
  let d = todayStr
  if (!logSet[d]) d = addDays(d, -1)
  let n = 0
  while (logSet[d]) {
    n += 1
    d = addDays(d, -1)
  }
  return n
}

export function calcMonth(logSet, todayStr) {
  const prefix = todayStr.slice(0, 7)
  return Object.keys(logSet).filter((k) => k.indexOf(prefix) === 0).length
}

/**
 * 登录后可见的公开活动摘要。不含心愿、未完成的小事、密码或会话。
 * 今日完成状态按北京时间在内存里刷新，不写回存档。
 */
export function presentActivity(store, now = new Date()) {
  const home = presentHome(store, now)
  const log = presentLog(home.store, now)
  const todayStr = today(now)
  const recentDays = [...new Set(home.store.history_logs.filter((d) => typeof d === 'string' && d <= todayStr))]
    .sort()
    .slice(-14)
    .reverse()
  return {
    pineCones: home.pineCones,
    totalLevel: home.totalLevel,
    levelWord: home.levelWord,
    stage: home.stage,
    attrs: home.attrs.map(({ key, name, icon, color, source, level, percent }) => ({
      key,
      name,
      icon,
      color,
      source,
      level,
      percent
    })),
    streak: log.streak,
    totalDays: log.totalDays,
    monthTotal: log.monthTotal,
    todayDone: home.doneCount,
    todayTotal: home.tasks.length,
    recentTasks: home.tasks
      .filter((task) => task.is_completed)
      .map((task) => {
        const row = {
          name: task.name,
          type: task.type,
          icon: ATTR_META[task.type].icon,
          reward_cones: task.reward_cones
        }
        if (task.minutes != null) row.minutes = task.minutes
        return row
      }),
    recentDays,
    scene: home.scene
  }
}

function compareName(left, right) {
  const a = String(left || '')
  const b = String(right || '')
  try {
    return a.localeCompare(b, 'zh')
  } catch (err) {
    return a < b ? -1 : a > b ? 1 : 0
  }
}

export function compareActivity(a, b) {
  return (
    b.totalLevel - a.totalLevel ||
    b.streak - a.streak ||
    b.pineCones - a.pineCones ||
    compareName(a.username, b.username)
  )
}

export function presentLog(store, now = new Date()) {
  const s = normalize(store, now)
  const logs = s.history_logs || []
  const set = {}
  logs.forEach((d) => {
    set[d] = true
  })
  const todayStr = today(now)
  const totalDays = logs.length
  return {
    totalDays,
    streak: calcStreak(set, todayStr),
    monthTotal: calcMonth(set, todayStr),
    poem: poem(totalDays),
    grid: buildGrid(set, todayStr)
  }
}
