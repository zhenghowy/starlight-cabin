import { useState } from 'react'
import { nativeExport, nativeMeta, nativeSync } from '../nativeCabin.js'

function when(value) {
  if (typeof value !== 'number' || value <= 0) return '还没有成功同步过'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function SyncButton({ onSynced }) {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState(() => nativeMeta())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function refresh() {
    setMeta(nativeMeta())
  }

  async function syncNow() {
    setBusy(true)
    setMessage('')
    try {
      const data = onSynced(await nativeSync())
      void data
      refresh()
      setMessage('同步完成')
    } catch (err) {
      refresh()
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  function exportBackup() {
    const result = nativeExport()
    setMessage(result.ok ? '备份已交给系统分享' : result.error || '没有导出')
  }

  const pending = meta.pending || 0
  const conflicts = meta.conflicts || []

  return (
    <>
      <button type="button" className="nav-sync" onClick={() => { refresh(); setOpen(true) }}>
        {pending ? `同步 ${pending}` : '同步'}
      </button>
      {open ? (
        <div className="mask" onClick={() => setOpen(false)}>
          <section className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>本机同步</h2>
            <p className="field-hint">上次成功：{when(meta.lastSyncAt)}</p>
            <p className="field-hint">还没同步：{pending} 条。大约每 7 天在有网时自动同步，系统可能会推迟。每天打开不会重新等服务器。</p>
            {meta.authExpired ? <p className="form-error">登录已过期。本机记录还在，重新登录后才能继续同步。</p> : null}
            {meta.lastError ? <p className="form-error">{meta.lastError}</p> : null}
            {conflicts.length ? (
              <ul className="sync-conflicts">
                {conflicts.map((item) => (
                  <li key={item.id}>{item.error || '这条和服务器对不上，还留在手机里'}</li>
                ))}
              </ul>
            ) : null}
            {message ? <p className="field-hint">{message}</p> : null}
            <button type="button" className="btn btn-moss btn-block" disabled={busy} onClick={syncNow}>
              {busy ? '正在同步…' : '立即同步'}
            </button>
            <button type="button" className="text-link" onClick={exportBackup}>
              导出本机备份
            </button>
            <p className="footer-note">卸载或清除数据会丢掉还没同步的记录。没有打开系统云备份。</p>
            <button type="button" className="text-link" onClick={() => setOpen(false)}>
              先这样
            </button>
          </section>
        </div>
      ) : null}
    </>
  )
}
