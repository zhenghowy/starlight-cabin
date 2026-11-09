const session = require('../../utils/session.js')

Page({
  data: { ready: false, adding: false, syncOpen: false, syncing: false, name: '', minutes: '', cost: '', formError: '' },
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
  noop() {},
  openSync() { this.setData({ syncOpen: true }) },
  closeSync() { this.setData({ syncOpen: false }) },
  openAdd() { this.setData({ adding: true, formError: '', name: '', minutes: '', cost: '' }) },
  closeAdd() { this.setData({ adding: false }) },
  onName(e) { this.setData({ name: e.detail.value }) },
  onMinutes(e) { this.setData({ minutes: e.detail.value }) },
  onCost(e) { this.setData({ cost: e.detail.value }) },
  onRedeem(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: `兑换「${name}」`,
      content: '去享受你的现实奖励吧，你值得这份温柔。',
      confirmText: '去享受',
      success: (res) => {
        if (!res.confirm) return
        try {
          session.getCabin().redeem(id)
          this.refresh()
        } catch (err) {
          wx.showToast({ title: err.message, icon: 'none' })
        }
      }
    })
  },
  onRemove(e) {
    session.getCabin().removeShop(e.currentTarget.dataset.id)
    this.refresh()
  },
  onAdd() {
    if (!String(this.data.name || '').trim()) {
      this.setData({ formError: '先给这件心愿起个名字' })
      return
    }
    try {
      session.getCabin().addShop({ name: this.data.name, minutes: this.data.minutes, cost: this.data.cost })
      this.setData({ adding: false })
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
  onLeave() {
    session.getCabin().logout()
    wx.reLaunch({ url: '/pages/auth/auth' })
  }
})
