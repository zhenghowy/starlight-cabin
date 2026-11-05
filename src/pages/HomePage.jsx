import { useEffect, useRef, useState } from 'react'
import { ATTR_META, formatConeLine, presentHome, readSignedField, TYPE_SHEET } from '@shared/game.js'
import { CoinFields } from '../components/CoinFields.jsx'
import { Modal, Sheet } from '../components/Modal.jsx'
import { Scene } from '../components/Scene.jsx'
import { Toast } from '../components/Toast.jsx'
import { useCabin } from '../context.jsx'

const sheetOptions = TYPE_SHEET.map((item) => ({
  ...item,
  icon: ATTR_META[item.type].icon
}))

export function HomePage() {
  const { store, setStore, request } = useCabin()
  const home = presentHome(store)
  const [fadingId, setFadingId] = useState('')
  const [toast, setToast] = useState('')
  const [pendingId, setPendingId] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftType, setDraftType] = useState('study')
  const [nameOpen, setNameOpen] = useState(false)
  const [taskName, setTaskName] = useState('')
  const [minutes, setMinutes] = useState('')
  const [reward, setReward] = useState('')
  const [rewardTouched, setRewardTouched] = useState(false)
  const [removeId, setRemoveId] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function flash(message) {
    setToast(message)
    const timer = setTimeout(() => setToast(''), 2200)
    timers.current.push(timer)
  }

  async function onCheckIn(id) {
    if (pendingId || fadingId) return
    setPendingId(id)
    try {
      const data = await request('/api/checkin', { method: 'POST', body: { taskId: id } })
      setFadingId(id)
      flash(data.toast)
      const timer = setTimeout(() => {
        setFadingId('')
        setStore(data.store)
        setPendingId('')
      }, 520)
      timers.current.push(timer)
    } catch (err) {
      setPendingId('')
      if (err.status !== 401) flash(err.message)
    }
  }

  function holdRemove(id) {
    setRemoveId(id)
  }

  async function confirmRemove() {
    setBusy(true)
    try {
      const data = await request(`/api/tasks/${removeId}`, { method: 'DELETE' })
      setStore(data.store)
      setRemoveId('')
    } catch (err) {
      if (err.status !== 401) setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function resetDraft() {
    setTaskName('')
    setMinutes('')
    setReward('')
    setRewardTouched(false)
    setFormError('')
  }

  function draftCopy() {
    const meta = ATTR_META[draftType]
    const lead = `${meta.icon} ${meta.name}`
    const typed = reward === '' || reward === '-' ? null : Number(reward)
    if (typed === null || !Number.isFinite(typed)) {
      const minutesValue = minutes === '' || minutes === '-' ? null : Number(minutes)
      if (minutesValue !== null && Number.isFinite(minutesValue)) {
        if (minutesValue < 0) return `${lead} · 按分钟先扣掉 ${Math.abs(minutesValue)} 枚松果`
        if (minutesValue === 0) return `${lead} · 完成后松果不变`
        return `${lead} · 按分钟先加上 ${minutesValue} 枚松果`
      }
      return `${lead} · 没填时先记 3 枚。填了分钟就按 1 分钟 1 枚`
    }
    if (typed < 0) return `${lead} · 这是放纵，完成后扣掉 ${Math.abs(typed)} 枚松果`
    if (typed === 0) return `${lead} · 完成后松果不变`
    return `${lead} · 完成后加上 ${typed} 枚松果`
  }

  async function confirmAdd() {
    const name = taskName.trim()
    if (!name) {
      setFormError('先给这件小事起个名字')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const data = await request('/api/tasks', {
        method: 'POST',
        body: { name, type: draftType, minutes: readSignedField(minutes), reward: readSignedField(reward) }
      })
      setStore(data.store)
      setNameOpen(false)
      resetDraft()
    } catch (err) {
      if (err.status !== 401) setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removing = home.tasks.find((task) => task.id === removeId)

  return (
    <div className="page">
      <div className="topbar">
        <div className="cones">
          <span className="cone-icon">🪙</span>
          <span className={`cone-num ${home.pineCones < 0 ? 'minus' : ''}`}>{home.pineCones}</span>
          <span className="cone-label">松果币</span>
        </div>
        <p className="greeting">{home.greeting}</p>
      </div>

      <Scene scene={home.scene} levelWord={home.levelWord} />

      <div className="attrs">
        {home.attrs.map((attr) => (
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

      <div className="section-head">
        <h2 className="section-title">今日小事</h2>
        <span className="section-sub">
          {home.doneCount}/{home.tasks.length} 已完成
        </span>
      </div>

      <div className="task-list">
        {home.tasks.map((task) => (
          <article
            key={task.id}
            className={`task ${task.is_completed ? 'done' : ''} ${fadingId === task.id ? 'fade-out' : ''}`}
            onContextMenu={(event) => {
              event.preventDefault()
              holdRemove(task.id)
            }}
            onPointerDown={(event) => {
              if (event.target.closest('button')) return
              const timer = setTimeout(() => holdRemove(task.id), 550)
              event.currentTarget.dataset.hold = String(timer)
            }}
            onPointerUp={(event) => clearTimeout(Number(event.currentTarget.dataset.hold))}
            onPointerLeave={(event) => clearTimeout(Number(event.currentTarget.dataset.hold))}
            onPointerCancel={(event) => clearTimeout(Number(event.currentTarget.dataset.hold))}
          >
            <div className="task-left">
              <span className="task-dot" style={{ background: ATTR_META[task.type].color }} />
              <div className="task-body">
                <span className="task-name">{task.name}</span>
                <span className={`task-reward ${task.reward_cones < 0 ? 'minus' : ''}`}>{formatConeLine(task.reward_cones, task.minutes)}</span>
              </div>
            </div>
            <button type="button" className="mini-remove" aria-label={`移除${task.name}`} onClick={() => holdRemove(task.id)}>
              ×
            </button>
            {task.is_completed ? (
              <span className="btn-done">已打卡</span>
            ) : (
              <button
                type="button"
                className="btn-check"
                data-testid={`checkin-${task.id}`}
                disabled={pendingId === task.id}
                onClick={() => onCheckIn(task.id)}
              >
                打卡
              </button>
            )}
          </article>
        ))}

        <button
          type="button"
          className="task task-add"
          onClick={() => {
            setFormError('')
            setSheetOpen(true)
          }}
        >
          <span className="add-plus">+</span>
          <span className="add-text">种下一件小事</span>
        </button>
      </div>

      <p className="footer-note">没完成也没关系，森林只是静静等着你。长按一件小事，也可以把它移出清单。</p>
      <Toast text={toast} />

      <Sheet
        open={sheetOpen}
        options={sheetOptions}
        onClose={() => setSheetOpen(false)}
        onPick={(type) => {
          setDraftType(type)
          setSheetOpen(false)
          resetDraft()
          setNameOpen(true)
        }}
      />

      <Modal
        open={nameOpen}
        title="种下一件小事"
        description={draftCopy()}
        confirmText="种下"
        cancelText="再想想"
        busy={busy}
        onClose={() => {
          if (!busy) setNameOpen(false)
        }}
        onConfirm={confirmAdd}
      >
        <label className="field">
          <span>今天想做的小事</span>
          <input
            maxLength={40}
            placeholder="例如：散步十分钟"
            value={taskName}
            onChange={(event) => setTaskName(event.target.value)}
          />
        </label>
        <CoinFields
          minutes={minutes}
          amount={reward}
          amountTouched={rewardTouched}
          onMinutes={setMinutes}
          onAmount={setReward}
          onAmountTouched={setRewardTouched}
          amountLabel="松果币"
          positiveLabel="这是放纵，记成负数"
          negativeLabel="改成好事（正数）"
          hint="1 分钟 = 1 枚松果。填分钟会先写上，还能改。好事用正数，完成时加上；放纵或坏习惯用负数，完成时扣掉。"
        />
        {formError && nameOpen ? <p className="form-error">{formError}</p> : null}
      </Modal>

      <Modal
        open={!!removing}
        title="移除这件小事？"
        description={removing ? `「${removing.name}」不会再出现在列表里。` : ''}
        confirmText="移除"
        cancelText="留下"
        tone="rose"
        busy={busy}
        onClose={() => {
          if (!busy) setRemoveId('')
        }}
        onConfirm={confirmRemove}
      >
        {formError && removing ? <p className="form-error">{formError}</p> : null}
      </Modal>
    </div>
  )
}
