Component({
  properties: {
    title: { type: String, value: '' },
    pending: { type: Number, value: 0 }
  },
  data: { status: 20, total: 64, padRight: 96, inner: 32 },
  lifetimes: {
    attached() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect()
      const status = info.statusBarHeight || 20
      const gap = Math.max(6, menu.top - status)
      const inner = menu.height || 32
      const total = status + gap * 2 + inner
      const padRight = Math.max(12, info.windowWidth - menu.left + 8)
      this.setData({ status, total, padRight, inner })
    }
  },
  methods: {
    onSync() { this.triggerEvent('sync') },
    onLeave() { this.triggerEvent('leave') }
  }
})
