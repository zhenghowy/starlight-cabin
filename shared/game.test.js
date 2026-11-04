import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDays,
  addTask,
  attrProgress,
  buildGrid,
  calcMonth,
  calcStreak,
  checkIn,
  checkInToast,
  compareActivity,
  emptyStore,
  poem,
  presentActivity,
  presentHome,
  presentLog,
  redeem,
  refreshDaily,
  removeTask,
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

test('log view counts distinct recorded days', () => {
  const store = emptyStore(noon)
  store.history_logs = ['2026-11-01', '2026-11-02']
  const log = presentLog(store, noon)
  assert.equal(log.totalDays, 2)
  assert.equal(log.streak, 2)
  assert.match(log.poem, /2 天/)
})
