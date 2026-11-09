const { createCabin } = require('./cabin.js')
const config = require('../config.js')

const listeners = new Set()
let cabin = null

function emit() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch (err) {
      // 页面已经关掉时，刷新失败不影响本机记录。
    }
  })
}

function pickSid(res, previous) {
  const list = []
  if (Array.isArray(res.cookies)) list.push(...res.cookies)
  const header = res.header || {}
  const raw = header['Set-Cookie'] || header['set-cookie']
  if (Array.isArray(raw)) list.push(...raw)
  else if (raw) list.push(raw)
  for (const item of list) {
    const part = String(item).split(';')[0].trim()
    if (part.startsWith('sid=')) return part.slice(4)
  }
  return previous || ''
}

function request({ path, method, body, sid }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.API_ORIGIN + path,
      method: method || 'GET',
      data: body,
      timeout: 20000,
      header: Object.assign({ 'content-type': 'application/json' }, sid ? { Cookie: `sid=${sid}` } : {}),
      success(res) {
        const data = res.data && typeof res.data === 'object' ? res.data : {}
        resolve({ status: res.statusCode, body: data, sid: pickSid(res, sid) })
      },
      fail() {
        const error = new Error('森林暂时连不上，本机记录还在')
        error.offline = true
        reject(error)
      }
    })
  })
}

function online() {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success(res) {
        resolve(Boolean(res.networkType && res.networkType !== 'none'))
      },
      fail() {
        resolve(true)
      }
    })
  })
}

function getCabin() {
  if (!cabin) {
    cabin = createCabin({
      storage: {
        read() {
          try {
            return wx.getStorageSync('cabin-state') || null
          } catch (err) {
            return null
          }
        },
        write(state) {
          wx.setStorageSync('cabin-state', state)
        }
      },
      request,
      online,
      onChange: emit
    })
  }
  return cabin
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function boot() {
  getCabin().catchUp().then(emit, emit)
}

module.exports = { getCabin, subscribe, boot }
