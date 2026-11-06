// 登录态和营地一起问。先等其中一件会多一次跨洋往返，页面才会出来。
export async function loadSession(request) {
  const mePromise = request('/api/me')
  const stateResult = request('/api/state').then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  )
  const me = await mePromise
  const state = await stateResult
  if (!state.ok) throw state.error
  return { user: me.user, store: state.value.store }
}
