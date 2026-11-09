const session = require('../../utils/session.js')
const game = require('../../utils/game.js')

function skyHeight() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const menu = wx.getMenuButtonBoundingClientRect()
  return Math.max(info.statusBarHeight || 20, menu.bottom || 0)
}

Page({
  data: {
    register: false,
    username: '',
    password: '',
    confirm: '',
    error: '',
    busy: false,
    sky: 48,
    scene: null,
    levelWord: ''
  },
  onLoad() {
    const preview = game.presentHome(game.emptyStore())
    this.setData({ sky: skyHeight(), scene: preview.scene, levelWord: preview.levelWord })
  },
  onShow() {
    if (session.getCabin().view().authed) wx.switchTab({ url: '/pages/home/home' })
  },
  onSwitch() {
    this.setData({ register: !this.data.register, error: '' })
  },
  onName(e) { this.setData({ username: e.detail.value }) },
  onPassword(e) { this.setData({ password: e.detail.value }) },
  onConfirm(e) { this.setData({ confirm: e.detail.value }) },
  async onSubmit() {
    const name = this.data.username.trim()
    if (name.length < 2) {
      this.setData({ error: '名字用 2 到 16 位汉字、字母或数字就好' })
      return
    }
    if (this.data.password.length < 6) {
      this.setData({ error: '密码至少 6 位' })
      return
    }
    if (this.data.register && this.data.password !== this.data.confirm) {
      this.setData({ error: '两次密码不一致' })
      return
    }
    this.setData({ busy: true, error: '' })
    try {
      await session.getCabin().signIn(name, this.data.password, this.data.register)
      this.setData({ password: '', confirm: '' })
      wx.switchTab({ url: '/pages/home/home' })
    } catch (err) {
      this.setData({ error: err.message || '没有完成' })
    } finally {
      this.setData({ busy: false })
    }
  }
})
