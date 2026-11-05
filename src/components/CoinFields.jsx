import { useId } from 'react'
import { sanitizeSignedInput } from '@shared/game.js'

export function CoinFields({
  minutes,
  amount,
  amountTouched,
  onMinutes,
  onAmount,
  onAmountTouched,
  amountLabel,
  hint,
  positiveLabel,
  negativeLabel
}) {
  const hintId = useId()
  const negative = amount.startsWith('-') && amount !== '-'

  function changeMinutes(value) {
    const next = sanitizeSignedInput(value)
    onMinutes(next)
    if (!amountTouched) onAmount(next)
  }

  function changeAmount(value) {
    onAmountTouched(true)
    onAmount(sanitizeSignedInput(value))
  }

  function toggleSign() {
    onAmountTouched(true)
    if (amount === '' || amount === '-') {
      const base = minutes !== '' && minutes !== '-' ? String(Math.abs(Number(minutes))) : '1'
      onAmount(negative ? base : `-${base}`)
      return
    }
    onAmount(amount.startsWith('-') ? amount.slice(1) : `-${amount}`)
  }

  return (
    <>
      <label className="field">
        <span>大约几分钟</span>
        <input
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          placeholder="例如 10"
          aria-describedby={hintId}
          value={minutes}
          onChange={(event) => changeMinutes(event.target.value)}
        />
      </label>
      <label className="field">
        <span>{amountLabel}</span>
        <input
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          placeholder="跟着分钟走，也能自己改"
          aria-describedby={hintId}
          value={amount}
          onChange={(event) => changeAmount(event.target.value)}
        />
      </label>
      <button type="button" className="sign-toggle" onClick={toggleSign}>
        {negative ? negativeLabel : positiveLabel}
      </button>
      <p id={hintId} className="field-hint">
        {hint}
      </p>
    </>
  )
}
