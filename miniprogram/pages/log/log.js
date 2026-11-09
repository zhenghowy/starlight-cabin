const session = require('../../utils/session.js')

Page({
  data: { ready: false },
  onShow() {
    const view = session.getCabin().view()
    if (!view.authed) {
      wx.reLaunch({ url: '/pages/auth/auth' })
      return
    }
    this.setData(Object.assign({ ready: true }, view.log))
  }
})
