import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDays,
  addShopItem,
  addTask,
  attrProgress,
  buildGrid,
  calcMonth,
  calcStreak,
  checkIn,
  checkInToast,
  clampCost,
  clampMinutes,
  clampReward,
  compareActivity,
  emptyStore,
  formatConeLine,
  normalize,
  poem,
  presentActivity,
  presentHome,
  presentLog,
  presentShop,
  redeem,
  refreshDaily,
  removeTask,
  readSignedField,
  sanitizeSignedInput,
  today,
  weekday
} from './game.js'

const noon = new Date('2026-11-03T04:00:00.000Z') // 北京时间 11 月 3 日中午

test('today follows Asia/Shanghai', () => {
  assert.equal(today(new Date('2026-11-02T16:30:00.000Z')), '2026-11-03')
  assert.equal(today(new Date('2026-11-02T15:30:00.000Z')), '2026-11-02')
})

test('check-in rewards cones, exp, and records the day once', () => {
  const start = emptyStore(noon)
  const result = checkIn(start, 't2', noon)
  assert.ok(result)
  assert.equal(result.store.user_profile.pine_cones, 5)
  assert.equal(result.store.user_profile.attributes.study.exp, 5)
  assert.equal(result.store.user_profile.attributes.study.level, 1)
  assert.equal(result.task.is_completed, true)
  assert.deepEqual(result.store.history_logs, ['2026-11-03'])
  assert.equal(checkInToast(result), '学识 +5，松果币 +5')

  const again = checkIn(result.store, 't2', noon)
  assert.equal(again, null)
  assert.equal(result.store.user_profile.pine_cones, 5)
})

test('experience levels up without dropping cones on a new day', () => {
  let store = emptyStore(noon)
  store.tasks = [{ id: 'big', name: '读完一章', type: 'study', reward_cones: 20, is_completed: false }]
  const result = checkIn(store, 'big', noon)
  assert.equal(result.leveled, true)
  assert.equal(result.level, 2)
  assert.equal(result.store.user_profile.attributes.study.exp, 0)
  assert.equal(result.store.user_profile.pine_cones, 20)
  assert.equal(checkInToast(result), '学识 升到 2 级了！小小嫩芽正在生长')

  const nextDay = new Date('2026-11-03T16:30:00.000Z')
  const refreshed = refreshDaily(result.store, nextDay)
  assert.equal(refreshed.tasks[0].is_completed, false)
  assert.equal(refreshed.user_profile.pine_cones, 20)
  assert.equal(refreshed.user_profile.attributes.study.level, 2)
  assert.equal(refreshed.last_open_date, '2026-11-04')

  const same = refreshDaily(refreshed, nextDay)
  assert.equal(same.last_open_date, '2026-11-04')
})

test('multi-level jump spends exp by each level threshold', () => {
  let store = emptyStore(noon)
  store.tasks = [{ id: 'big', name: '长读', type: 'study', reward_cones: 99, is_completed: false }]
  const result = checkIn(store, 'big', noon)
  assert.equal(result.store.user_profile.attributes.study.level, 3)
  assert.equal(result.store.user_profile.attributes.study.exp, 39)
})

test('redeem spends cones and refuses a poor squirrel', () => {
  let store = emptyStore(noon)
  store.user_profile.pine_cones = 30
  const poor = redeem(store, 's2')
  assert.equal(poor.ok, false)
  assert.equal(poor.reason, 'poor')
  assert.equal(store.user_profile.pine_cones, 30)

  const ok = redeem(store, 's1')
  assert.equal(ok.ok, true)
  assert.equal(ok.store.user_profile.pine_cones, 0)
  assert.equal(redeem(store, 'missing').ok, false)
})

test('tasks can be planted and removed', () => {
  const added = addTask(emptyStore(noon), '  散步十分钟  ', 'fitness', 3, noon)
  assert.equal(added.ok, true)
  const created = added.store.tasks.at(-1)
  assert.equal(created.name, '散步十分钟')
  assert.equal(created.reward_cones, 3)
  assert.equal(created.is_completed, false)
  const left = removeTask(added.store, created.id)
  assert.equal(left.tasks.some((t) => t.id === created.id), false)
  assert.equal(addTask(emptyStore(noon), '  ', 'study', 3, noon).ok, false)
})

test('progress, scene stage, and greeting follow the original formulas', () => {
  const store = emptyStore(noon)
  assert.equal(attrProgress(store.user_profile.attributes.study), 0)
  store.user_profile.attributes.study.exp = 10
  assert.equal(attrProgress(store.user_profile.attributes.study), 0.5)

  const home = presentHome(store, noon)
  assert.equal(home.levelWord, '一颗种子')
  assert.equal(home.scene.cones, 1)
  assert.equal(home.greeting, '森林在安静地等你，不着急。')

  for (const key of ['study', 'fitness', 'routine', 'saving']) {
    store.user_profile.attributes[key].level = 2
  }
  assert.equal(presentHome(store, noon).levelWord, '小小嫩芽')
})

test('streak ignores a quiet today and the poem grows with the forest', () => {
  const todayStr = '2026-11-03'
  const set = {
    '2026-11-01': true,
    '2026-11-02': true,
    '2026-10-31': true
  }
  assert.equal(calcStreak(set, todayStr), 3)
  assert.equal(calcStreak({ '2026-11-03': true, '2026-11-02': true }, todayStr), 2)
  assert.equal(calcStreak({ '2026-11-01': true }, todayStr), 0)
  assert.equal(calcMonth({ '2026-11-02': true, '2026-10-31': true, '2026-11-03': true }, todayStr), 2)

  assert.match(poem(0), /第一笔/)
  assert.match(poem(1), /第一步/)
  assert.match(poem(3), /幼苗/)
  assert.match(poem(8), /2 处灌木丛/)
  assert.match(poem(30), /小径/)
  assert.match(poem(100), /本来的样子/)
})

test('heatmap is Sunday-aligned and does not light the future', () => {
  assert.equal(weekday('2026-11-01'), 0)
  const grid = buildGrid({ '2026-11-03': true, '2026-11-04': true }, '2026-11-03')
  assert.ok(grid.length >= 12)
  for (const week of grid) assert.equal(week.days.length, 7)
  const flat = grid.flatMap((w) => w.days)
  const todayCell = flat.find((d) => d.date === '2026-11-03')
  const tomorrow = flat.find((d) => d.date === '2026-11-04')
  assert.equal(todayCell.lit, true)
  assert.equal(todayCell.future, false)
  assert.equal(tomorrow.lit, false)
  assert.equal(tomorrow.future, true)
  assert.equal(weekday(grid[0].days[0].date), 0)
  assert.ok(grid[0].days[0].date <= addDays('2026-11-03', -83))
})

test('public activity shows progress without wishes or unfinished tasks', () => {
  let store = emptyStore(noon)
  store.user_profile.pine_cones = 12
  store.user_profile.attributes.study.level = 3
  store.history_logs = ['2026-11-01', '2026-11-02']
  const checked = checkIn(store, 't2', noon)
  const activity = presentActivity(checked.store, noon)
  assert.equal(activity.pineCones, 17)
  assert.equal(activity.attrs.find((attr) => attr.key === 'study').level, 3)
  assert.equal(activity.streak, 3)
  assert.equal(activity.todayDone, 1)
  assert.deepEqual(activity.recentTasks.map((task) => task.name), ['读几页书，和陌生的思想握个手'])
  assert.equal(JSON.stringify(activity).includes('热可可'), false)
  assert.equal(JSON.stringify(activity).includes('向月亮交还意识'), false)

  const order = [
    { username: '乙', totalLevel: 4, streak: 1, pineCones: 9 },
    { username: '甲', totalLevel: 8, streak: 0, pineCones: 1 }
  ].sort(compareActivity)
  assert.deepEqual(order.map((item) => item.username), ['甲', '乙'])
})

test('coin amounts stay custom, including zero and negatives', () => {
  assert.equal(clampReward(undefined), 3)
  assert.equal(clampReward(''), 3)
  assert.equal(clampReward('abc'), 3)
  assert.equal(clampReward(0), 0)
  assert.equal(clampReward(-8), -8)
  assert.equal(clampReward(' -12.6 '), -13)
  assert.equal(clampReward(100000), 9999)
  assert.equal(clampReward(-100000), -9999)
  assert.equal(clampCost(-5), -5)
  assert.equal(clampCost(''), 0)
  assert.equal(clampMinutes(''), null)
  assert.equal(clampMinutes(10), 10)
  assert.equal(clampMinutes(-3), -3)
  assert.equal(sanitizeSignedInput('0012'), '12')
  assert.equal(sanitizeSignedInput('-10'), '-10')
  assert.equal(sanitizeSignedInput('-'), '-')
  assert.equal(sanitizeSignedInput('99999'), '9999')
  assert.equal(formatConeLine(-4, 10), '10 分钟 · -4 松果')
  assert.equal(readSignedField(''), undefined)
  assert.equal(readSignedField('-'), undefined)
  assert.equal(readSignedField('-8'), -8)
  assert.equal(readSignedField('0'), 0)
})

test('minutes suggest coins one for one, and an override wins', () => {
  const suggested = addTask(emptyStore(noon), '读二十分钟', 'study', undefined, noon, 20)
  assert.equal(suggested.ok, true)
  const planted = suggested.store.tasks.at(-1)
  assert.equal(planted.reward_cones, 20)
  assert.equal(planted.minutes, 20)

  const indulgence = addTask(emptyStore(noon), '熬夜刷剧', 'routine', -8, noon, 30)
  const bad = indulgence.store.tasks.at(-1)
  assert.equal(bad.reward_cones, -8)
  assert.equal(bad.minutes, 30)

  const fromNegativeMinutes = addTask(emptyStore(noon), '刷手机', 'routine', '', noon, -15)
  assert.equal(fromNegativeMinutes.store.tasks.at(-1).reward_cones, -15)

  const wish = addShopItem(emptyStore(noon), '发呆一刻', '', noon, 15)
  assert.equal(wish.store.shop_items.at(-1).cost, 15)
  assert.equal(wish.store.shop_items.at(-1).minutes, 15)
  const refund = addShopItem(emptyStore(noon), '退回一颗', -6, noon)
  assert.equal(refund.store.shop_items.at(-1).cost, -6)
  assert.equal('minutes' in refund.store.shop_items.at(-1), false)
})

test('a negative reward deducts cones and leaves the forest standing', () => {
  let store = emptyStore(noon)
  store.user_profile.pine_cones = 5
  store.user_profile.attributes.routine.exp = 6
  store.tasks.push({ id: 'bad', name: '熬夜', type: 'routine', reward_cones: -4, minutes: 4, is_completed: false })
  const result = checkIn(store, 'bad', noon)
  assert.equal(result.leveled, false)
  assert.equal(result.store.user_profile.pine_cones, 1)
  assert.equal(result.store.user_profile.attributes.routine.exp, 6)
  assert.equal(result.store.user_profile.attributes.routine.level, 1)
  assert.equal(checkInToast(result), '放纵记下了，松果币 -4')
  assert.equal(result.store.history_logs.includes('2026-11-03'), true)

  const kept = refreshDaily(result.store, noon)
  const saved = kept.tasks.find((task) => task.id === 'bad')
  assert.equal(kept.user_profile.pine_cones, 1)
  assert.equal(saved.reward_cones, -4)
  assert.equal(saved.minutes, 4)

  store = emptyStore(noon)
  store.user_profile.pine_cones = 2
  store.tasks = [{ id: 'bad', name: '再熬一会', type: 'routine', reward_cones: -5, is_completed: false }]
  const debt = checkIn(store, 'bad', noon)
  assert.equal(debt.store.user_profile.pine_cones, -3)
  assert.equal(normalize(debt.store, noon).user_profile.pine_cones, -3)
})

test('zero reward changes nothing, and a negative wish returns cones', () => {
  let store = emptyStore(noon)
  store.user_profile.pine_cones = 4
  store.tasks = [{ id: 'quiet', name: '只是记下', type: 'study', reward_cones: 0, is_completed: false }]
  const quiet = checkIn(store, 'quiet', noon)
  assert.equal(quiet.store.user_profile.pine_cones, 4)
  assert.equal(quiet.store.user_profile.attributes.study.exp, 0)
  assert.equal(checkInToast(quiet), '记下了，松果币没有变化')

  store = emptyStore(noon)
  store.user_profile.pine_cones = 1
  store.shop_items.push({ id: 'back', name: '退回', cost: -6 })
  const shop = presentShop(store)
  assert.equal(shop.items.find((item) => item.id === 'back').affordable, true)
  const returned = redeem(store, 'back')
  assert.equal(returned.ok, true)
  assert.equal(returned.store.user_profile.pine_cones, 7)

  const old = emptyStore(noon)
  const healed = normalize(old, noon)
  assert.equal(healed.user_profile.pine_cones, 0)
  assert.equal('minutes' in healed.tasks[0], false)
  assert.equal(healed.tasks[0].reward_cones, 5)
  assert.equal('minutes' in healed.shop_items[0], false)
  assert.equal(healed.shop_items[0].cost, 30)
  old.user_profile.pine_cones = 'nope'
  assert.equal(normalize(old, noon).user_profile.pine_cones, 0)
})

test('log view counts distinct recorded days', () => {
  const store = emptyStore(noon)
  store.history_logs = ['2026-11-01', '2026-11-02']
  const log = presentLog(store, noon)
  assert.equal(log.totalDays, 2)
  assert.equal(log.streak, 2)
  assert.match(log.poem, /2 天/)
})
