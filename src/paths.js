export function historyPath(screen, inCabinApp) {
  if (!inCabinApp) return screen
  if (screen === '/') return '/cabin/index.html'
  return `/cabin${screen}`
}

export function normalizePath(path) {
  let value = typeof path === 'string' ? path : '/'
  if (value.startsWith('/cabin/')) value = value.slice('/cabin'.length)
  else if (value === '/cabin') value = '/'
  if (value.endsWith('/index.html')) value = value.slice(0, -'/index.html'.length) || '/'
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1)
  if (!value.startsWith('/')) value = `/${value}`
  if (value === '/shop' || value === '/log' || value === '/board' || value === '/login' || value === '/register') return value
  if (/^\/board\/u_[a-f0-9]+$/.test(value)) return value
  return '/'
}
