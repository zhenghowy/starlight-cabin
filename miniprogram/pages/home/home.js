const session = require('../../utils/session.js')

Page({
  data: { ready: false, syncing: false, adding: false, types: ['学识', '能量', '秩序', '储蓄'], typeIndex: 0, name: '', minutes: '', reward: '' },
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
    this.setData(Object.assign({ ready: true }, view))
  },
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
  toggleAdd() {
    this.setData({ adding: !this.data.adding })
  },
  onType(e) {
    this.setData({ typeIndex: Number(e.detail.value) })
  },
  onName(e) {
    this.setData({ name: e.detail.value })
  },
  onMinutes(e) {
    this.setData({ minutes: e.detail.value })
  },
  onReward(e) {
    this.setData({ reward: e.detail.value })
  },
  onAdd() {
    const types = ['study', 'fitness', 'routine', 'saving']
    try {
      session.getCabin().addTask({
        name: this.data.name,
        type: types[this.data.typeIndex],
        minutes: this.data.minutes,
        reward: this.data.reward
      })
      this.setData({ adding: false, name: '', minutes: '', reward: '' })
      this.refresh()
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' })
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
