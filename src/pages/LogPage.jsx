import { presentLog } from '@shared/game.js'
import { useCabin } from '../context.jsx'

export function LogPage() {
  const { store } = useCabin()
  const log = presentLog(store)

  return (
    <div className="page">
      <section className="poem-card">
        <span className="poem-icon">🌿</span>
        <p className="poem">{log.poem}</p>
      </section>

      <section className="stats">
        <article className="stat">
          <span className="stat-num">{log.totalDays}</span>
          <span className="stat-label">累计天数</span>
        </article>
        <article className="stat">
          <span className="stat-num">{log.streak}</span>
          <span className="stat-label">连续天数</span>
        </article>
        <article className="stat">
          <span className="stat-num">{log.monthTotal}</span>
          <span className="stat-label">本月天数</span>
        </article>
      </section>

      <section className="heat-card">
        <h2 className="heat-title">打卡墙 · 近 12 周</h2>
        <div className="heat-scroll">
          <div className="heat-inner">
            <div className="month-row">
              {log.grid.map((week, index) => (
                <div key={index} className="month-cell">
                  {week.label}
                </div>
              ))}
            </div>
            <div className="grid">
              {log.grid.map((week, index) => (
                <div key={index} className="week">
                  {week.days.map((day, dayIndex) => (
                    <div
                      key={day.date || `empty-${dayIndex}`}
                      className={`cell ${day.lit ? 'lit' : ''} ${day.future ? 'future' : ''}`}
                      title={day.date ? `${day.date}${day.lit ? ' · 有打卡' : ''}` : undefined}
                      aria-label={day.date ? `${day.date}${day.lit ? ' 已打卡' : day.future ? ' 还没到' : ' 未打卡'}` : undefined}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="legend">
          <span className="legend-text">少</span>
          <span className="cell" />
          <span className="cell lit" />
          <span className="legend-text">多</span>
        </div>
      </section>

      <p className="footer-note">空白的日子不是失败，只是森林在安静地陪你。</p>
    </div>
  )
}
