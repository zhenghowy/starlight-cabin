const session = require('../../utils/session.js')

Page({
  data: { ready: false, syncOpen: false },
  onShow() {
    const view = session.getCabin().view()
    if (!view.authed) {
      wx.reLaunch({ url: '/pages/auth/auth' })
      return
    }
    this.setData({
      ready: true,
      board: view.board,
      boardText: view.boardText,
      hasBoard: view.boardAt > 0,
      pending: view.sync.pending,
      lastSyncText: view.sync.lastSyncText,
      syncOpen: this.data.syncOpen
    })
  },
  noop() {},
  openSync() { this.setData({ syncOpen: true }) },
  closeSync() { this.setData({ syncOpen: false }) },
  async onSync() {
    const result = await session.getCabin().sync(true)
    wx.showToast({ title: result.ok ? '同步完成' : result.error, icon: 'none' })
    this.onShow()
  },
  onLeave() {
    session.getCabin().logout()
    wx.reLaunch({ url: '/pages/auth/auth' })
  },
  onOpen(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  }
})
