export function Toast({ text }) {
  return <div className={`toast ${text ? 'show' : ''}`}>{text}</div>
}
