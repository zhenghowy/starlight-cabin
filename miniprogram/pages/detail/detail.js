const session = require('../../utils/session.js')

Page({
  data: { ready: false, missing: false, pending: 0, syncOpen: false },
  onLoad(query) {
    const view = session.getCabin().view()
    if (!view.authed) {
      wx.reLaunch({ url: '/pages/auth/auth' })
      return
    }
    const entry = session.getCabin().boardEntry(query.id)
    this.setData({
      ready: true,
      missing: !entry,
      entry: entry || {},
      boardText: view.boardText,
      hasBoard: view.boardAt > 0,
      pending: view.sync.pending
    })
  },
  openSync() {
    this.setData({ syncOpen: true })
  },
  closeSync() {
    this.setData({ syncOpen: false })
  },
  noop() {},
  async onSync() {
    const result = await session.getCabin().sync(true)
    wx.showToast({ title: result.ok ? '同步完成' : result.error, icon: 'none' })
    this.setData({ syncOpen: false, pending: session.getCabin().view().sync.pending })
  },
  onLeave() {
    session.getCabin().logout()
    wx.reLaunch({ url: '/pages/auth/auth' })
  },
  back() {
    wx.navigateBack()
  }
})
