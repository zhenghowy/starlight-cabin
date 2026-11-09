const session = require('../../utils/session.js')

Page({
  data: { ready: false, missing: false },
  onLoad(query) {
    const view = session.getCabin().view()
    if (!view.authed) {
      wx.reLaunch({ url: '/pages/auth/auth' })
      return
    }
    const entry = session.getCabin().boardEntry(query.id)
    if (!entry) {
      this.setData({ ready: true, missing: true, boardText: view.boardText })
      return
    }
    this.setData({ ready: true, missing: false, entry, boardText: view.boardText, hasBoard: view.boardAt > 0 })
  }
})
