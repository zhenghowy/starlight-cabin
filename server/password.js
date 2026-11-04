import crypto from 'node:crypto'

const KEYLEN = 32

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const actual = Buffer.from(hash, 'hex')
  const expect = crypto.scryptSync(password, salt, KEYLEN)
  if (actual.length !== expect.length) return false
  return crypto.timingSafeEqual(actual, expect)
}
