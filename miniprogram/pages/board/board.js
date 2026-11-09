const session = require('../../utils/session.js')

Page({
  data: { ready: false },
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
      hasBoard: view.boardAt > 0
    })
  },
  onOpen(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  }
})
