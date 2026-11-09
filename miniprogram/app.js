const session = require('./utils/session.js')

App({
  onLaunch() {
    session.boot()
  },
  onShow() {
    session.boot()
  }
})
