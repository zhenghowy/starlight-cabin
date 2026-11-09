const session = require('../../utils/session.js')

const TYPES = [
  { type: 'study', label: '学识（学习）', icon: '📜' },
  { type: 'fitness', label: '能量（健身）', icon: '🏃' },
  { type: 'routine', label: '秩序（作息）', icon: '🌙' },
  { type: 'saving', label: '储蓄（省钱）', icon: '🪙' }
]

Page({
  data: {
    ready: false,
    syncing: false,
    syncOpen: false,
    typeOpen: false,
    nameOpen: false,
    typeOptions: TYPES,
    draftType: 'study',
    name: '',
    minutes: '',
    reward: '',
    formError: ''
  },
  onShow() {
    this.refresh()
    this._unsub = session.subscribe(() => this.refresh())
  },
  onHide() {
    if (this._unsub) this._unsub()
  },
  refresh() {
    const view = session.getCabin().view()
    if (!view.authed) {
      wx.reLaunch({ url: '/pages/auth/auth' })
      return
    }
    const type = TYPES.find((item) => item.type === this.data.draftType) || TYPES[0]
    this.setData(Object.assign({ ready: true, draftCopy: `${type.icon} ${type.label}` }, view))
  },
  noop() {},
  openSync() { this.setData({ syncOpen: true }) },
  closeSync() { this.setData({ syncOpen: false }) },
  openTypes() { this.setData({ typeOpen: true, formError: '' }) },
  closeTypes() { this.setData({ typeOpen: false }) },
  closeName() { this.setData({ nameOpen: false }) },
  pickType(e) {
    const draftType = e.currentTarget.dataset.type
    this.setData({ draftType, typeOpen: false, nameOpen: true, name: '', minutes: '', reward: '', formError: '' })
    this.refresh()
  },
  onName(e) { this.setData({ name: e.detail.value }) },
  onMinutes(e) { this.setData({ minutes: e.detail.value }) },
  onReward(e) { this.setData({ reward: e.detail.value }) },
  async onCheckIn(e) {
    try {
      const applied = session.getCabin().checkIn(e.currentTarget.dataset.id)
      wx.showToast({ title: applied.message || '记下了', icon: 'none' })
      this.refresh()
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' })
    }
  },
  onRemove(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '移除这件小事？',
      content: `「${name}」不会再出现在列表里。`,
      success: (res) => {
        if (!res.confirm) return
        session.getCabin().removeTask(id)
        this.refresh()
      }
    })
  },
  onAdd() {
    if (!String(this.data.name || '').trim()) {
      this.setData({ formError: '先给这件小事起个名字' })
      return
    }
    try {
      session.getCabin().addTask({
        name: this.data.name,
        type: this.data.draftType,
        minutes: this.data.minutes,
        reward: this.data.reward
      })
      this.setData({ nameOpen: false, name: '', minutes: '', reward: '', formError: '' })
      this.refresh()
    } catch (err) {
      this.setData({ formError: err.message })
    }
  },
  async onSync() {
    this.setData({ syncing: true })
    const result = await session.getCabin().sync(true)
    this.setData({ syncing: false })
    wx.showToast({ title: result.ok ? '同步完成' : result.error, icon: 'none' })
    this.refresh()
  },
  onBackup() {
    const backup = session.getCabin().exportBackup()
    if (!backup.ok) {
      wx.showToast({ title: backup.error, icon: 'none' })
      return
    }
    wx.setClipboardData({ data: JSON.stringify(backup) })
  },
  onLeave() {
    const result = session.getCabin().logout()
    wx.showToast({ title: result.pending ? `已离开，还有 ${result.pending} 条未同步` : '已离开', icon: 'none' })
    wx.reLaunch({ url: '/pages/auth/auth' })
  }
})
