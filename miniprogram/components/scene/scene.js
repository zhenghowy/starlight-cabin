Component({
  properties: {
    scene: { type: Object, value: null },
    levelWord: { type: String, value: '' },
    caption: { type: Boolean, value: true },
    flush: { type: Boolean, value: false }
  },
  data: { em: 0.45, stars: [], cones: [] },
  lifetimes: {
    attached() {
      this.measure()
      this.paint()
    }
  },
  observers: {
    'scene, flush': function () {
      this.measure()
      this.paint()
    }
  },
  methods: {
    measure() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const gutter = this.data.flush ? 0 : 32
      const width = Math.max(280, info.windowWidth - gutter)
      const stars = []
      for (let i = 0; i < 12; i += 1) {
        stars.push({ left: (i * 37 + 11) % 92, top: (i * 23 + 7) % 58 })
      }
      this.setData({ em: width / 750, stars })
    },
    paint() {
      const scene = this.data.scene
      if (!scene) return
      const cones = []
      for (let i = 0; i < scene.cones; i += 1) cones.push({ left: i * 22, bottom: (i % 2) * 10 })
      this.setData({
        treeH: scene.treeHeight,
        foliage: scene.foliage,
        foliage2: scene.foliage * 0.7,
        crownBottom: scene.treeHeight - 10,
        crown2Bottom: scene.treeHeight + scene.foliage * 0.35,
        smallH: scene.treeHeight * 0.6,
        smallF: scene.foliage * 0.62,
        smallBottom: scene.treeHeight * 0.6 - 8,
        light: scene.lightOpacity,
        campW: scene.campWidth,
        starOpacity: scene.starOpacity,
        cones
      })
    }
  }
})
