import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { CabinContext } from './context.jsx'
import { AuthPage } from './pages/AuthPage.jsx'
import { BoardPage } from './pages/BoardPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { LogPage } from './pages/LogPage.jsx'
import { ShopPage } from './pages/ShopPage.jsx'

const TABS = [
  { path: '/', label: '我的营地' },
  { path: '/shop', label: '林间杂货铺' },
  { path: '/log', label: '岁月年轮' },
  { path: '/board', label: '林间排行' }
]

function normalizePath(path) {
  if (path === '/shop' || path === '/log' || path === '/board' || path === '/login' || path === '/register') return path
  if (/^\/board\/u_[a-f0-9]+$/.test(path)) return path
  return '/'
}

function screenFor(path, { authed, booting, bootError }) {
  if (booting || (bootError && !authed)) return path
  if (!authed) return path === '/register' ? '/register' : '/login'
  if (path === '/login' || path === '/register') return '/'
  return path
}

export default function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname))
  const [user, setUser] = useState(null)
  const [store, setStore] = useState(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const navigate = useCallback((to) => {
    const next = normalizePath(to)
    if (window.location.pathname !== next) window.history.pushState({}, '', next)
    setPath(next)
  }, [])

  useEffect(() => {
    const onPop = () => setPath(normalizePath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const load = useCallback(async () => {
    const me = await api('/api/me')
    const state = await api('/api/state')
    setUser(me.user)
    setStore(state.store)
    return state.store
  }, [])

  useEffect(() => {
    let alive = true
    load()
      .catch((err) => {
        if (!alive) return
        if (err.status === 401) {
          setUser(null)
          setStore(null)
        } else {
          setBootError(err.message)
        }
      })
      .finally(() => {
        if (alive) setBooting(false)
      })
    return () => {
      alive = false
    }
  }, [load])

  const authed = Boolean(user && store)
  const screen = screenFor(path, { authed, booting, bootError })

  useEffect(() => {
    if (window.location.pathname !== screen) {
      window.history.replaceState({}, '', screen)
    }
  }, [screen])

  useEffect(() => {
    if (!authed) return undefined
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      load().catch((err) => {
        if (err.status === 401) {
          setUser(null)
          setStore(null)
        }
      })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [authed, load])

  useEffect(() => {
    const tab = TABS.find((item) => item.path === screen)
    document.title = tab ? `${tab.label} · 星空下的林中小屋` : '星空下的林中小屋'
  }, [screen])

  const request = useCallback(
    async (url, options) => {
      try {
        return await api(url, options)
      } catch (err) {
        if (err.status === 401) {
          setUser(null)
          setStore(null)
          navigate('/login')
        }
        throw err
      }
    },
    [navigate]
  )

  async function submitAuth(body) {
    setAuthBusy(true)
    setAuthError('')
    try {
      const data = await api(screen === '/register' ? '/api/register' : '/api/login', {
        method: 'POST',
        body
      })
      setUser(data.user)
      setStore(data.store)
      navigate('/')
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthBusy(false)
    }
  }

  async function logout() {
    try {
      await api('/api/logout', { method: 'POST' })
    } catch {
      // 网络抖一下也先把本地的门带上
    }
    setUser(null)
    setStore(null)
    navigate('/login')
  }

  async function retryBoot() {
    setBooting(true)
    setBootError('')
    try {
      await load()
    } catch (err) {
      if (err.status === 401) {
        setUser(null)
        setStore(null)
      } else {
        setBootError(err.message)
      }
    } finally {
      setBooting(false)
    }
  }

  const contextValue = useMemo(
    () => ({ user, store, setStore, request, navigate }),
    [user, store, request, navigate]
  )
  const title = screen.startsWith('/board/')
    ? '营地足迹'
    : TABS.find((item) => item.path === screen)?.label || '我的营地'

  let body
  if (booting) {
    body = (
      <div className="boot">
        <div className="boot-moon" />
        <p>小屋正在点灯…</p>
      </div>
    )
  } else if (bootError && !authed) {
    body = (
      <div className="boot">
        <p>{bootError}</p>
        <button type="button" className="btn btn-moss" onClick={retryBoot}>
          再试一次
        </button>
      </div>
    )
  } else if (!authed) {
    body = (
      <AuthPage
        mode={screen === '/register' ? 'register' : 'login'}
        error={authError}
        busy={authBusy}
        onSubmit={submitAuth}
        onSwitch={() => {
          setAuthError('')
          navigate(screen === '/register' ? '/login' : '/register')
        }}
      />
    )
  } else if (screen === '/shop') {
    body = <ShopPage />
  } else if (screen === '/log') {
    body = <LogPage />
  } else if (screen === '/board' || screen.startsWith('/board/')) {
    body = <BoardPage userId={screen.startsWith('/board/') ? screen.slice('/board/'.length) : ''} />
  } else {
    body = <HomePage />
  }

  return (
    <CabinContext.Provider value={contextValue}>
      <div className="stage">
        <aside className="stage-copy">
          <p className="stage-kicker">STARLIGHT CABIN</p>
          <p className="stage-title">
            星空下的
            <br />
            林中小屋
          </p>
          <p>把今天的小事种进森林里。学识长成树，作息点亮窗，能量铺开营地，储蓄堆起松果。</p>
          <p>没完成也没关系。这里只记得你做过的事，不惩罚空白的日子。</p>
        </aside>
        <div className="app-frame">
          {authed ? (
            <header className="nav">
              <h1>{title}</h1>
              <button type="button" className="nav-leave" onClick={logout} title={`${user.username} 的营地`}>
                离开
              </button>
            </header>
          ) : null}
          <main className="frame-scroll">{body}</main>
          {authed ? (
            <nav className="tabbar" aria-label="营地导航">
              {TABS.map((tab) => (
                <button
                  key={tab.path}
                  type="button"
                  className={screen === tab.path || (tab.path === '/board' && screen.startsWith('/board/')) ? 'active' : ''}
                  onClick={() => navigate(tab.path)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      </div>
    </CabinContext.Provider>
  )
}
