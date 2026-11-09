const session = require('../../utils/session.js')

Page({
  data: { ready: false, adding: false, name: '', minutes: '', cost: '' },
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
  onRedeem(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: `兑换「${name}」`,
      content: '这是现实里的奖励，不经过微信支付。',
      confirmText: '去享受',
      success: (res) => {
        if (!res.confirm) return
        try {
          session.getCabin().redeem(id)
          this.refresh()
          wx.showToast({ title: '兑换成功', icon: 'none' })
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
  toggleAdd() {
    this.setData({ adding: !this.data.adding })
  },
  onName(e) { this.setData({ name: e.detail.value }) },
  onMinutes(e) { this.setData({ minutes: e.detail.value }) },
  onCost(e) { this.setData({ cost: e.detail.value }) },
  onAdd() {
    try {
      session.getCabin().addShop({ name: this.data.name, minutes: this.data.minutes, cost: this.data.cost })
      this.setData({ adding: false, name: '', minutes: '', cost: '' })
      this.refresh()
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' })
    }
  }
})
