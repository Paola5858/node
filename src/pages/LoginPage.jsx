import React, { useState } from 'react'
import { authService } from '../services/authService'

function LoginPage({ onAuthenticated, onNavigate }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(event) {
    event.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const usuario = await authService.entrar(email.trim().toLowerCase(), senha)
      if (!usuario) throw new Error('o servidor não confirmou a identidade da conta.')
      onAuthenticated(usuario)
    } catch (error) {
      setErro(error.message)
    } finally {
      setCarregando(false)
      setSenha('')
    }
  }

  return <section className="auth-screen"><div className="auth-orbit" aria-hidden="true"><span /><span /><i>p</i></div><div className="auth-card glass-card"><span className="eyebrow"><span className="eyebrow-line" /> acesso / sessão do servidor</span><h1>volte para a <em>operação.</em></h1><p className="auth-lead">suas credenciais são validadas pelo serviço de autenticação, nunca neste navegador.</p>{erro && <div className="error-feedback" role="alert"><strong>acesso não confirmado.</strong><span>{erro}</span></div>}<form onSubmit={entrar} noValidate><div className="field"><label htmlFor="login-email">e-mail<span>*</span></label><input id="login-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" autoComplete="username" required /></div><div className="field"><label htmlFor="login-senha">senha<span>*</span></label><input id="login-senha" name="senha" type="password" value={senha} onChange={(event) => setSenha(event.target.value)} placeholder="sua senha" autoComplete="current-password" required /></div><button className="button-primary auth-submit" type="submit" disabled={carregando}>{carregando ? 'validando acesso...' : 'entrar no Plume'} <span>→</span></button></form><div className="auth-divider"><span>sem conta?</span></div><button className="button-ghost auth-register" type="button" onClick={() => onNavigate('usuarios')}>solicitar cadastro</button><small className="auth-footnote">a sessão só começa após confirmação do servidor.</small></div></section>
}
export default LoginPage
