import { useState } from 'react'
import { emptyStore, presentHome } from '@shared/game.js'
import { ApkDownload } from '../components/ApkDownload.jsx'
import { Scene } from '../components/Scene.jsx'

const preview = presentHome(emptyStore())

export function AuthPage({ mode, onSubmit, onSwitch, error, busy }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')
  const isRegister = mode === 'register'

  function submit(event) {
    event.preventDefault()
    const name = username.trim()
    if (name.length < 2) {
      setLocalError('名字用 2 到 16 位汉字、字母或数字就好')
      return
    }
    if (password.length < 6) {
      setLocalError('密码至少 6 位')
      return
    }
    if (isRegister && password !== confirm) {
      setLocalError('两次密码不一致')
      return
    }
    setLocalError('')
    onSubmit({ username: name, password })
  }

  const message = localError || error

  return (
    <div className="auth-page">
      <Scene scene={preview.scene} levelWord={preview.levelWord} caption={false} />
      <form className="auth-card" onSubmit={submit}>
        <p className="auth-kicker">星空下的林中小屋</p>
        <h1>{isRegister ? '种下一颗种子' : '回到你的营地'}</h1>
        <p className="auth-lead">
          {isRegister ? '给自己取一个林间名字。这片森林很小，只留给你和几位朋友。' : '森林在安静地等你。登录之后，看见的是你自己的小屋。'}
        </p>

        <label className="field">
          <span>林间名字</span>
          <input
            name="username"
            autoComplete="username"
            maxLength={16}
            placeholder="例如：林间"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="field">
          <span>密码</span>
          <input
            name="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            maxLength={64}
            placeholder="至少 6 位"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {isRegister ? (
          <label className="field">
            <span>再写一次密码</span>
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              maxLength={64}
              placeholder="再确认一次"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>
        ) : null}

        {message ? <p className="form-error">{message}</p> : null}

        <button className="btn btn-moss btn-block" type="submit" disabled={busy}>
          {busy ? '正在推开门…' : isRegister ? '注册并进入' : '进入营地'}
        </button>
        <button className="text-link" type="button" onClick={onSwitch}>
          {isRegister ? '已经有营地了？回去登录' : '还没有账号？种下一颗种子'}
        </button>
        <ApkDownload />
      </form>
    </div>
  )
}
