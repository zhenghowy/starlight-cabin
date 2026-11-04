/**
 * 星空下的林中小屋 — 玩法与数据模型。
 * 与原小程序 utils/store.js、三个页面的计算保持一致。
 * 纯函数，不碰 wx / localStorage / 文件系统。日期按北京时间。
 */

export const STORAGE_KEY = 'starlight_cabin_store'
export const EXP_PER_LEVEL = 20
export const TIME_ZONE = 'Asia/Shanghai'
export const LEVEL_WORDS = ['一颗种子', '小小嫩芽', '舒展的树', '繁茂的树', '参天巨木']

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

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

export function today(now = new Date(), timeZone = TIME_ZONE) {
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
  const cones = Math.round(Number(s.user_profile.pine_cones))
  s.user_profile.pine_cones = Number.isFinite(cones) && cones >= 0 ? cones : 0
  s.user_profile.attributes = s.user_profile.attributes || {}
  for (const key of ATTR_TYPES) {
    s.user_profile.attributes[key] = healAttr(s.user_profile.attributes[key])
  }
  if (!Array.isArray(s.tasks)) s.tasks = clone(DEFAULT_TASKS)
  if (!Array.isArray(s.shop_items)) s.shop_items = clone(DEFAULT_SHOP)
  if (!Array.isArray(s.history_logs)) s.history_logs = []
  s.tasks = s.tasks
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && ATTR_META[t.type])
    .map((t) => ({
      id: t.id,
      name: String(t.name),
      type: t.type,
      reward_cones: clampReward(t.reward_cones),
      is_completed: !!t.is_completed
    }))
  s.shop_items = s.shop_items
    .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
    .map((item) => ({
      id: item.id,
      name: String(item.name),
      cost: clampCost(item.cost)
    }))
  if (typeof s.last_open_date !== 'string') s.last_open_date = today(now)
  return s
}

export function clampCost(cost) {
  const n = Math.round(Number(cost))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(9999, n)
}

export function clampReward(reward) {
  const n = Math.round(Number(reward))
  if (!Number.isFinite(n) || n <= 0) return 3
  return Math.min(99, n)
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
  s.user_profile.pine_cones += task.reward_cones

  const attr = s.user_profile.attributes[task.type]
  attr.exp += task.reward_cones

  let leveled = false
  let guard = 0
  while (attr.exp >= attr.level * EXP_PER_LEVEL && guard < 40) {
    attr.exp -= attr.level * EXP_PER_LEVEL
    attr.level += 1
    leveled = true
    guard += 1
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
  if (result.leveled) {
    const word = LEVEL_WORDS[Math.min(4, result.level - 1)]
    return `${result.attrName} 升到 ${result.level} 级了！${word}正在生长`
  }
  return `${result.attrName} +${result.task.reward_cones}，松果币 +${result.task.reward_cones}`
}

export function redeem(store, itemId) {
  const s = normalize(store)
  const item = s.shop_items.find((x) => x.id === itemId)
  if (!item) return { ok: false }
  if (s.user_profile.pine_cones < item.cost) return { ok: false, reason: 'poor' }
  s.user_profile.pine_cones -= item.cost
  return { ok: true, store: s, item: { ...item } }
}

export function addShopItem(store, name, cost, now = new Date()) {
  const s = normalize(store, now)
  const trimmed = String(name || '').trim()
  if (!trimmed) return { ok: false, reason: 'name' }
  if (trimmed.length > 40) return { ok: false, reason: 'long' }
  s.shop_items.push({
    id: nextId('s', now),
    name: trimmed,
    cost: clampCost(cost)
  })
  return { ok: true, store: s }
}

export function removeShopItem(store, id) {
  const s = normalize(store)
  s.shop_items = s.shop_items.filter((x) => x.id !== id)
  return s
}

export function addTask(store, name, type, reward, now = new Date()) {
  const s = normalize(store, now)
  const trimmed = String(name || '').trim()
  if (!ATTR_META[type]) return { ok: false, reason: 'type' }
  if (!trimmed) return { ok: false, reason: 'name' }
  if (trimmed.length > 40) return { ok: false, reason: 'long' }
  s.tasks.push({
    id: nextId('t', now),
    name: trimmed,
    type,
    reward_cones: clampReward(reward),
    is_completed: false
  })
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
      affordable: s.user_profile.pine_cones >= item.cost
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
      .map((task) => ({
        name: task.name,
        type: task.type,
        icon: ATTR_META[task.type].icon,
        reward_cones: task.reward_cones
      })),
    recentDays,
    scene: home.scene
  }
}

export function compareActivity(a, b) {
  return (
    b.totalLevel - a.totalLevel ||
    b.streak - a.streak ||
    b.pineCones - a.pineCones ||
    String(a.username || '').localeCompare(String(b.username || ''), 'zh')
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
