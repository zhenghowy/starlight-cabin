import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { emptyStore, normalize } from '../shared/game.js'

const SESSION_MS = 30 * 24 * 60 * 60 * 1000

export function createRepository(dataDir, { maxUsers = 20 } = {}) {
  const savesDir = path.join(dataDir, 'saves')
  fs.mkdirSync(savesDir, { recursive: true })

  const usersFile = path.join(dataDir, 'users.json')
  const sessionsFile = path.join(dataDir, 'sessions.json')
  const locks = new Map()

  function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve()
    const run = prev.then(fn, fn)
    locks.set(
      key,
      run.then(
        () => {},
        () => {}
      )
    )
    return run
  }

  function readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      if (err && err.code === 'ENOENT') return fallback
      throw err
    }
  }

  function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, file)
  }

  function readUsers() {
    const data = readJson(usersFile, { users: [] })
    if (!data || !Array.isArray(data.users)) return { users: [] }
    return data
  }

  function readSessions() {
    const data = readJson(sessionsFile, { sessions: [] })
    if (!data || !Array.isArray(data.sessions)) return { sessions: [] }
    return data
  }

  function savePath(userId) {
    if (!/^u_[a-f0-9]+$/.test(userId)) {
      const err = new Error('bad user id')
      err.code = 'BAD_ID'
      throw err
    }
    return path.join(savesDir, `${userId}.json`)
  }

  function publicUser(user) {
    return { id: user.id, username: user.username }
  }

  async function createUser({ username, passwordHash }) {
    return withLock('users', async () => {
      const data = readUsers()
      const usernameKey = username.toLowerCase()
      if (data.users.some((u) => u.usernameKey === usernameKey)) {
        const err = new Error('taken')
        err.code = 'TAKEN'
        throw err
      }
      if (data.users.length >= maxUsers) {
        const err = new Error('full')
        err.code = 'FULL'
        throw err
      }
      const user = {
        id: `u_${crypto.randomBytes(8).toString('hex')}`,
        username,
        usernameKey,
        passwordHash,
        createdAt: new Date().toISOString()
      }
      data.users.push(user)
      writeJson(usersFile, data)
      writeJson(savePath(user.id), emptyStore())
      return publicUser(user)
    })
  }

  async function findUserByName(username) {
    const data = readUsers()
    const key = String(username || '').toLowerCase()
    return data.users.find((u) => u.usernameKey === key) || null
  }

  async function findUserById(id) {
    const data = readUsers()
    const user = data.users.find((u) => u.id === id)
    return user ? publicUser(user) : null
  }

  async function listUsers() {
    return readUsers().users.map(publicUser)
  }

  async function readSave(userId) {
    return withLock(`save:${userId}`, async () => {
      const file = savePath(userId)
      try {
        return normalize(JSON.parse(fs.readFileSync(file, 'utf8')))
      } catch (err) {
        if (err && err.code === 'ENOENT') return normalize(null)
        throw err
      }
    })
  }

  async function createSession(userId) {
    return withLock('sessions', async () => {
      const data = readSessions()
      const now = Date.now()
      data.sessions = data.sessions.filter((s) => s.expiresAt > now)
      const session = {
        id: crypto.randomBytes(32).toString('hex'),
        userId,
        createdAt: new Date(now).toISOString(),
        expiresAt: now + SESSION_MS
      }
      data.sessions.push(session)
      writeJson(sessionsFile, data)
      return session
    })
  }

  async function getSession(sid) {
    if (!sid) return null
    return withLock('sessions', async () => {
      const data = readSessions()
      const now = Date.now()
      const before = data.sessions.length
      data.sessions = data.sessions.filter((s) => s.expiresAt > now)
      const session = data.sessions.find((s) => s.id === sid) || null
      if (data.sessions.length !== before) writeJson(sessionsFile, data)
      return session
    })
  }

  async function deleteSession(sid) {
    return withLock('sessions', async () => {
      const data = readSessions()
      data.sessions = data.sessions.filter((s) => s.id !== sid)
      writeJson(sessionsFile, data)
    })
  }

  async function updateSave(userId, fn) {
    return withLock(`save:${userId}`, async () => {
      const file = savePath(userId)
      let existed = true
      let raw = null
      try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch (err) {
        if (err && err.code === 'ENOENT') existed = false
        else throw err
      }
      const current = normalize(existed ? raw : emptyStore())
      const next = fn(current)
      const serialized = JSON.stringify(next)
      if (!existed || JSON.stringify(current) !== serialized) {
        writeJson(file, next)
      }
      return next
    })
  }

  return {
    createUser,
    findUserByName,
    findUserById,
    listUsers,
    readSave,
    createSession,
    getSession,
    deleteSession,
    updateSave
  }
}
