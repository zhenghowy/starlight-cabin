import { useEffect, useState } from 'react'
import { Scene } from '../components/Scene.jsx'
import { useCabin } from '../context.jsx'

function formatDay(date) {
  if (!date || date.length < 10) return date
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
}

export function BoardPage({ userId = '' }) {
  const { request, navigate } = useCabin()
  const [entries, setEntries] = useState(null)
  const [entry, setEntry] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    const path = userId ? `/api/board/${userId}` : '/api/board'
    request(path)
      .then((data) => {
        if (!alive) return
        if (userId) setEntry(data.entry)
        else setEntries(data.entries)
      })
      .catch((err) => {
        if (!alive || err.status === 401) return
        setError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [request, userId])

  if (loading) {
    return (
      <div className="boot">
        <div className="boot-moon" />
        <p>正在数一数林子里的脚印…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <p className="form-error">{error}</p>
        <button type="button" className="btn btn-moss" onClick={() => navigate('/board')}>
          回到排行
        </button>
      </div>
    )
  }

  if (userId && entry) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={() => navigate('/board')}>
          ← 返回排行
        </button>
        <header className="shop-header">
          <h2 className="section-title">
            {entry.username}
            {entry.me ? <span className="rank-you">你</span> : null}
          </h2>
          <p className="header-sub">
            第 {entry.rank} 名 · {entry.levelWord} · 合计 Lv.{entry.totalLevel}
          </p>
        </header>
        <Scene scene={entry.scene} levelWord={entry.levelWord} />
        <section className="stats">
          <article className="stat">
            <span className="stat-num">{entry.pineCones}</span>
            <span className="stat-label">松果币</span>
          </article>
          <article className="stat">
            <span className="stat-num">{entry.streak}</span>
            <span className="stat-label">连续天数</span>
          </article>
          <article className="stat">
            <span className="stat-num">{entry.totalDays}</span>
            <span className="stat-label">累计天数</span>
          </article>
        </section>
        <div className="attrs">
          {entry.attrs.map((attr) => (
            <article key={attr.key} className="attr">
              <div className="attr-top">
                <span className="attr-name">
                  {attr.icon} {attr.name}
                </span>
                <span className="attr-lv">Lv.{attr.level}</span>
              </div>
              <div className="attr-bar" aria-hidden="true">
                <div className="attr-fill" style={{ width: `${attr.percent}%`, background: attr.color }} />
              </div>
              <div className="attr-source">
                {attr.source} · {attr.percent}%
              </div>
            </article>
          ))}
        </div>
        <h2 className="section-title">今日完成的小事</h2>
        <p className="header-sub">
          {entry.todayDone}/{entry.todayTotal} 已完成 · 本月打卡 {entry.monthTotal} 天
        </p>
        <div className="task-list" style={{ marginTop: 10 }}>
          {entry.recentTasks.length === 0 ? (
            <p className="footer-note">今天还没有留下脚印。</p>
          ) : (
            entry.recentTasks.map((task) => (
              <article key={task.name} className="task">
                <div className="task-body">
                  <span className="task-name">
                    {task.icon} {task.name}
                  </span>
                  <span className="task-reward">+{task.reward_cones} 松果</span>
                </div>
              </article>
            ))
          )}
        </div>
        <h2 className="section-title" style={{ marginTop: 18 }}>
          最近打卡
        </h2>
        {entry.recentDays.length === 0 ? (
          <p className="footer-note">还没有打卡的日子。</p>
        ) : (
          <div className="day-row">
            {entry.recentDays.map((day) => (
              <span key={day} className="day-chip">
                {formatDay(day)}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <p className="board-lead">这里能看见朋友们的营地长成什么样。只展示等级、松果和打卡，心愿和密码都留在各自的小屋里。</p>
      <div className="rank-list">
        {(entries || []).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rank-card ${item.me ? 'me' : ''}`}
            onClick={() => navigate(`/board/${item.id}`)}
          >
            <span className="rank-no">{item.rank}</span>
            <span className="rank-main">
              <span className="rank-top">
                <span className="rank-name">
                  {item.username}
                  {item.me ? <span className="rank-you">你</span> : null}
                </span>
                <span className="rank-level">{item.levelWord}</span>
              </span>
              <span className="rank-meta">
                <span>合计 Lv.{item.totalLevel}</span>
                <span>🪙 {item.pineCones}</span>
                <span>连续 {item.streak} 天</span>
                <span>
                  今日 {item.todayDone}/{item.todayTotal}
                </span>
              </span>
              <span className="rank-attrs">
                {item.attrs.map((attr) => (
                  <span key={attr.key}>
                    {attr.icon} {attr.name} {attr.level}
                  </span>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>
      {(entries || []).length === 0 ? <p className="footer-note">森林还在等第一位朋友。</p> : null}
    </div>
  )
}
