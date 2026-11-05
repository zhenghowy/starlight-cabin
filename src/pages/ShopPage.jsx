import { useState } from 'react'
import { presentShop, readSignedField } from '@shared/game.js'
import { CoinFields } from '../components/CoinFields.jsx'
import { Modal } from '../components/Modal.jsx'
import { Toast } from '../components/Toast.jsx'
import { useCabin } from '../context.jsx'

function wishCostLabel(item) {
  const price = item.cost < 0 ? `🪙 ${item.cost} · 退回` : `🪙 ${item.cost}`
  if (item.minutes == null) return price
  return `${item.minutes} 分钟 · ${price}`
}

function wishDraftCopy(cost, minutes) {
  const typed = cost === '' || cost === '-' ? null : Number(cost)
  if (typed === null || !Number.isFinite(typed)) {
    const minutesValue = minutes === '' || minutes === '-' ? null : Number(minutes)
    if (minutesValue !== null && Number.isFinite(minutesValue)) {
      if (minutesValue < 0) return `按分钟先记成退回 ${Math.abs(minutesValue)} 枚松果。`
      if (minutesValue === 0) return '这件心愿不花松果。'
      return `按分钟先记 ${minutesValue} 枚松果，还能改。`
    }
    return '没填时不花松果。填了分钟就按 1 分钟 1 枚。'
  }
  if (typed < 0) return `兑换时退回 ${Math.abs(typed)} 枚松果。`
  if (typed === 0) return '这件心愿不花松果。'
  return `兑换时花掉 ${typed} 枚松果。`
}

function redeemCopy(item) {
  if (item.cost < 0) return `会把 ${Math.abs(item.cost)} 枚松果退回给你。`
  if (item.cost === 0) return '这件心愿不花松果，去享受就好。'
  return `将消耗 ${item.cost} 松果币，换一份现实里的奖励。`
}

export function ShopPage() {
  const { store, setStore, request } = useCabin()
  const shop = presentShop(store)
  const [toast, setToast] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('')
  const [cost, setCost] = useState('')
  const [costTouched, setCostTouched] = useState(false)
  const [confirmItem, setConfirmItem] = useState(null)
  const [success, setSuccess] = useState(false)
  const [removeId, setRemoveId] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  function flash(message) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }

  function askRedeem(item) {
    if (!item.affordable) {
      flash('松果还不够哦，小松鼠正在努力收集呢')
      return
    }
    setConfirmItem(item)
  }

  async function confirmRedeem() {
    if (!confirmItem) return
    setBusy(true)
    try {
      const data = await request('/api/redeem', { method: 'POST', body: { itemId: confirmItem.id } })
      setStore(data.store)
      setConfirmItem(null)
      setSuccess(true)
    } catch (err) {
      setConfirmItem(null)
      if (err.status !== 401) flash(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmAdd() {
    if (!name.trim()) {
      setFormError('先给心愿起个名字')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const data = await request('/api/shop', {
        method: 'POST',
        body: { name: name.trim(), minutes: readSignedField(minutes), cost: readSignedField(cost) }
      })
      setStore(data.store)
      setAddOpen(false)
      setName('')
      setMinutes('')
      setCost('')
      setCostTouched(false)
    } catch (err) {
      if (err.status !== 401) setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmRemove() {
    setBusy(true)
    try {
      const data = await request(`/api/shop/${removeId}`, { method: 'DELETE' })
      setStore(data.store)
      setRemoveId('')
    } catch (err) {
      if (err.status !== 401) flash(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removing = shop.items.find((item) => item.id === removeId)

  return (
    <div className="page">
      <header className="shop-header">
        <div className="cones">
          <span className="cone-icon">🪙</span>
          <span className={`cone-num ${shop.pineCones < 0 ? 'minus' : ''}`}>{shop.pineCones}</span>
        </div>
        <p className="header-sub">攒下的松果，可以换成现实里的甜</p>
      </header>

      <div className="list">
        {shop.items.map((item) => (
          <article
            key={item.id}
            className="item"
            onContextMenu={(event) => {
              event.preventDefault()
              setRemoveId(item.id)
            }}
            onPointerDown={(event) => {
              if (event.target.closest('button')) return
              const timer = setTimeout(() => setRemoveId(item.id), 550)
              event.currentTarget.dataset.hold = String(timer)
            }}
            onPointerUp={(event) => clearTimeout(Number(event.currentTarget.dataset.hold))}
            onPointerLeave={(event) => clearTimeout(Number(event.currentTarget.dataset.hold))}
            onPointerCancel={(event) => clearTimeout(Number(event.currentTarget.dataset.hold))}
          >
            <div className="item-left">
              <span className="item-name">{item.name}</span>
              <span className={`item-cost ${item.cost < 0 ? 'minus' : ''}`}>{wishCostLabel(item)}</span>
            </div>
            <button type="button" className="mini-remove" aria-label={`移除${item.name}`} onClick={() => setRemoveId(item.id)}>
              ×
            </button>
            <button
              type="button"
              className={`btn-redeem ${item.affordable ? '' : 'disabled'}`}
              data-testid={`redeem-${item.id}`}
              onClick={() => askRedeem(item)}
            >
              兑换
            </button>
          </article>
        ))}

        <button
          type="button"
          className="item item-add"
          onClick={() => {
            setFormError('')
            setName('')
            setMinutes('')
            setCost('')
            setCostTouched(false)
            setAddOpen(true)
          }}
        >
          <span className="add-plus">+</span>
          <span className="add-text">添加一个心愿</span>
        </button>
      </div>

      <p className="footer-note">心愿不用多，够你惦记就好。长按也可以移出一件心愿。</p>
      <Toast text={toast} />

      <Modal
        open={addOpen}
        title="添加一件心愿"
        description={wishDraftCopy(cost, minutes)}
        confirmText="放进铺子"
        cancelText="取消"
        tone="amber"
        busy={busy}
        onClose={() => !busy && setAddOpen(false)}
        onConfirm={confirmAdd}
      >
        <label className="field">
          <span>心愿</span>
          <input maxLength={40} placeholder="例如：喝一杯热可可" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <CoinFields
          minutes={minutes}
          amount={cost}
          amountTouched={costTouched}
          onMinutes={setMinutes}
          onAmount={setCost}
          onAmountTouched={setCostTouched}
          amountLabel="松果币"
          positiveLabel="记成负数，兑换时退回"
          negativeLabel="改成正数，兑换时花掉"
          hint="1 分钟 = 1 枚松果。填分钟会先写上价格，还能改。正数是花掉的松果，负数兑换时退回。"
        />
        {formError ? <p className="form-error">{formError}</p> : null}
      </Modal>

      <Modal
        open={!!confirmItem}
        title={confirmItem ? `兑换「${confirmItem.name}」` : ''}
        description={confirmItem ? redeemCopy(confirmItem) : ''}
        confirmText="去享受"
        cancelText="再攒攒"
        tone="amber"
        busy={busy}
        onClose={() => !busy && setConfirmItem(null)}
        onConfirm={confirmRedeem}
      />

      <Modal open={success} title="兑换成功" description="去享受你的现实奖励吧，你值得这份温柔。" confirmText="好" onClose={() => setSuccess(false)} onConfirm={() => setSuccess(false)} />

      <Modal
        open={!!removing}
        title="移除这个心愿？"
        confirmText="移除"
        cancelText="留下"
        tone="rose"
        busy={busy}
        onClose={() => !busy && setRemoveId('')}
        onConfirm={confirmRemove}
      />
    </div>
  )
}
