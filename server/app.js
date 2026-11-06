import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { APK_NAME, APK_PATH } from '../shared/apk.js'
import {
  addShopItem,
  addTask,
  checkIn,
  checkInToast,
  compareActivity,
  presentActivity,
  redeem,
  refreshDaily,
  removeShopItem,
  removeTask
} from '../shared/game.js'
import { hashPassword, verifyPassword } from './password.js'
import { createRepository } from './repository.js'

const USERNAME_RE = /^[\p{Script=Han}a-zA-Z0-9_]{2,16}$/u
const SESSION_SECONDS = 30 * 24 * 60 * 60

function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

function cookieValue(sid, { secure, maxAge }) {
  const parts = [`sid=${sid}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function createApp({
  dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  distDir = path.join(process.cwd(), 'dist'),
  publicDir = path.join(process.cwd(), 'public'),
  cookieSecure = process.env.COOKIE_SECURE === '1',
  allowRegister = process.env.ALLOW_REGISTER !== '0',
  maxUsers = Number(process.env.MAX_USERS || 20)
} = {}) {
  const repo = createRepository(dataDir, {
    maxUsers: Number.isFinite(maxUsers) && maxUsers > 0 ? maxUsers : 20
  })
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '32kb' }))

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store')
    next()
  })

  const attempts = new Map()

  function tooMany(req) {
    const ip = req.ip || req.socket.remoteAddress || 'local'
    const now = Date.now()
    const recent = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000)
    if (recent.length >= 40) {
      attempts.set(ip, recent)
      return true
    }
    recent.push(now)
    attempts.set(ip, recent)
    return false
  }

  async function currentUser(req) {
    const sid = parseCookies(req.headers.cookie).sid
    const session = await repo.getSession(sid)
    if (!session) return null
    const user = await repo.findUserById(session.userId)
    if (!user) return null
    return { user, sid }
  }

  function requireUser(req, res, next) {
    currentUser(req)
      .then((found) => {
        if (!found) {
          res.status(401).json({ error: '请先登录' })
          return
        }
        req.user = found.user
        req.sid = found.sid
        next()
      })
      .catch(next)
  }

  function setSessionCookie(res, sid) {
    res.setHeader('Set-Cookie', cookieValue(sid, { secure: cookieSecure, maxAge: SESSION_SECONDS }))
  }

  function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', cookieValue('', { secure: cookieSecure, maxAge: 0 }))
  }

  function validateUsername(username) {
    const name = String(username || '').trim()
    if (!USERNAME_RE.test(name)) {
      return { error: '名字用 2 到 16 位汉字、字母或数字就好' }
    }
    return { name }
  }

  function validatePassword(password) {
    const value = String(password ?? '')
    if (value.length < 6 || value.length > 64) {
      return { error: '密码至少 6 位，最长 64 位' }
    }
    return { password: value }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'starlight-cabin' })
  })

  app.post('/api/register', async (req, res, next) => {
    try {
      if (!allowRegister) {
        res.status(403).json({ error: '营地暂时不再接收新朋友' })
        return
      }
      if (tooMany(req)) {
        res.status(429).json({ error: '试得太勤了，先在林子里坐一会儿' })
        return
      }
      const nameCheck = validateUsername(req.body?.username)
      if (nameCheck.error) {
        res.status(400).json({ error: nameCheck.error })
        return
      }
      const passCheck = validatePassword(req.body?.password)
      if (passCheck.error) {
        res.status(400).json({ error: passCheck.error })
        return
      }
      let user
      try {
        user = await repo.createUser({
          username: nameCheck.name,
          passwordHash: hashPassword(passCheck.password)
        })
      } catch (err) {
        if (err.code === 'TAKEN') {
          res.status(409).json({ error: '这个林间名字已经有人用了' })
          return
        }
        if (err.code === 'FULL') {
          res.status(403).json({ error: '这片森林很小，暂时只收留这么多朋友' })
          return
        }
        throw err
      }
      const session = await repo.createSession(user.id)
      const store = await repo.updateSave(user.id, (current) => refreshDaily(current))
      setSessionCookie(res, session.id)
      res.status(201).json({ user, store })
    } catch (err) {
      next(err)
    }
  })

  app.post('/api/login', async (req, res, next) => {
    try {
      if (tooMany(req)) {
        res.status(429).json({ error: '试得太勤了，先在林子里坐一会儿' })
        return
      }
      const nameCheck = validateUsername(req.body?.username)
      const passCheck = validatePassword(req.body?.password)
      if (nameCheck.error || passCheck.error) {
        res.status(401).json({ error: '账号或密码不对' })
        return
      }
      const record = await repo.findUserByName(nameCheck.name)
      if (!record || !verifyPassword(passCheck.password, record.passwordHash)) {
        res.status(401).json({ error: '账号或密码不对' })
        return
      }
      const session = await repo.createSession(record.id)
      const store = await repo.updateSave(record.id, (current) => refreshDaily(current))
      setSessionCookie(res, session.id)
      res.json({ user: { id: record.id, username: record.username }, store })
    } catch (err) {
      next(err)
    }
  })

  app.post('/api/logout', async (req, res, next) => {
    try {
      const sid = parseCookies(req.headers.cookie).sid
      if (sid) await repo.deleteSession(sid)
      clearSessionCookie(res)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  app.get('/api/me', requireUser, (req, res) => {
    res.json({ user: req.user })
  })

  function activityEntry(user, store, meId) {
    return {
      id: user.id,
      username: user.username,
      me: user.id === meId,
      ...presentActivity(store)
    }
  }

  app.get('/api/board', requireUser, async (req, res, next) => {
    try {
      const users = await repo.listUsers()
      const entries = []
      for (const user of users) {
        const store = await repo.readSave(user.id)
        const entry = activityEntry(user, store, req.user.id)
        delete entry.scene
        entries.push(entry)
      }
      entries.sort(compareActivity)
      entries.forEach((entry, index) => {
        entry.rank = index + 1
      })
      res.json({ entries })
    } catch (err) {
      next(err)
    }
  })

  app.get('/api/board/:id', requireUser, async (req, res, next) => {
    try {
      if (!/^u_[a-f0-9]+$/.test(req.params.id)) {
        res.status(404).json({ error: '这片林子里没有这位朋友' })
        return
      }
      const user = await repo.findUserById(req.params.id)
      if (!user) {
        res.status(404).json({ error: '这片林子里没有这位朋友' })
        return
      }
      const users = await repo.listUsers()
      const ranked = []
      for (const item of users) {
        const store = await repo.readSave(item.id)
        ranked.push(activityEntry(item, store, req.user.id))
      }
      ranked.sort(compareActivity)
      const found = ranked.find((entry) => entry.id === user.id)
      found.rank = ranked.findIndex((entry) => entry.id === user.id) + 1
      res.json({ entry: found })
    } catch (err) {
      next(err)
    }
  })

  app.get('/api/state', requireUser, async (req, res, next) => {
    try {
      const store = await repo.updateSave(req.user.id, (current) => refreshDaily(current))
      res.json({ user: req.user, store })
    } catch (err) {
      next(err)
    }
  })

  app.post('/api/checkin', requireUser, async (req, res, next) => {
    try {
      const taskId = String(req.body?.taskId || '')
      let toast = ''
      let status = 200
      let error = ''
      const store = await repo.updateSave(req.user.id, (current) => {
        const fresh = refreshDaily(current)
        const result = checkIn(fresh, taskId)
        if (!result) {
          status = 400
          error = '这件小事已经打过卡了'
          return fresh
        }
        toast = checkInToast(result)
        return result.store
      })
      if (status !== 200) {
        res.status(status).json({ error, store })
        return
      }
      res.json({ store, toast })
    } catch (err) {
      next(err)
    }
  })

  app.post('/api/tasks', requireUser, async (req, res, next) => {
    try {
      let error = ''
      const store = await repo.updateSave(req.user.id, (current) => {
        const fresh = refreshDaily(current)
        const result = addTask(fresh, req.body?.name, req.body?.type, req.body?.reward, undefined, req.body?.minutes)
        if (!result.ok) {
          error = result.reason === 'type' ? '请选择学识、能量、秩序或储蓄' : result.reason === 'long' ? '名字太长了，收一收' : '先给这件小事起个名字'
          return fresh
        }
        return result.store
      })
      if (error) {
        res.status(400).json({ error, store })
        return
      }
      res.status(201).json({ store })
    } catch (err) {
      next(err)
    }
  })

  app.delete('/api/tasks/:id', requireUser, async (req, res, next) => {
    try {
      const store = await repo.updateSave(req.user.id, (current) => removeTask(refreshDaily(current), req.params.id))
      res.json({ store })
    } catch (err) {
      next(err)
    }
  })

  app.post('/api/shop', requireUser, async (req, res, next) => {
    try {
      let error = ''
      const store = await repo.updateSave(req.user.id, (current) => {
        const fresh = refreshDaily(current)
        const result = addShopItem(fresh, req.body?.name, req.body?.cost, undefined, req.body?.minutes)
        if (!result.ok) {
          error = result.reason === 'long' ? '名字太长了，收一收' : '先给心愿起个名字'
          return fresh
        }
        return result.store
      })
      if (error) {
        res.status(400).json({ error, store })
        return
      }
      res.status(201).json({ store })
    } catch (err) {
      next(err)
    }
  })

  app.delete('/api/shop/:id', requireUser, async (req, res, next) => {
    try {
      const store = await repo.updateSave(req.user.id, (current) => removeShopItem(refreshDaily(current), req.params.id))
      res.json({ store })
    } catch (err) {
      next(err)
    }
  })

  app.post('/api/redeem', requireUser, async (req, res, next) => {
    try {
      let payload = null
      const store = await repo.updateSave(req.user.id, (current) => {
        const fresh = refreshDaily(current)
        const result = redeem(fresh, String(req.body?.itemId || ''))
        payload = result
        return result.ok ? result.store : fresh
      })
      if (!payload?.ok) {
        const error = payload?.reason === 'poor' ? '松果还不够哦，小松鼠正在努力收集呢' : '找不到这件心愿'
        res.status(400).json({ error, reason: payload?.reason || 'missing', store })
        return
      }
      res.json({
        store,
        item: payload.item,
        message: '去享受你的现实奖励吧，你值得这份温柔。'
      })
    } catch (err) {
      next(err)
    }
  })

  app.get(APK_PATH, (req, res, next) => {
    const file = [path.join(distDir, 'downloads', APK_NAME), path.join(publicDir, 'downloads', APK_NAME)].find((item) =>
      fs.existsSync(item)
    )
    if (!file) {
      res.status(404).type('text/plain; charset=utf-8').send('安装包还没有放好')
      return
    }
    res.sendFile(
      file,
      {
        dotfiles: 'deny',
        headers: {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': `attachment; filename="${APK_NAME}"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-cache'
        }
      },
      (err) => {
        if (err) next(err)
      }
    )
  })

  if (fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, file) {
          if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
          if (file.endsWith('.apk')) {
            res.setHeader('Content-Type', 'application/vnd.android.package-archive')
            res.setHeader('X-Content-Type-Options', 'nosniff')
          }
        }
      })
    )
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if (req.path.startsWith('/api')) return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(distDir, 'index.html'), (err) => {
        if (err) next(err)
      })
    })
  }

  app.use((err, _req, res, _next) => {
    console.error(err)
    if (res.headersSent) return
    res.status(500).json({ error: '小屋这边出了点状况，请稍后再试' })
  })

  return app
}
