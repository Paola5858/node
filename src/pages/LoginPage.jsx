import { useState } from 'react'
import { iniciarSessao, lerUsuario, solicitarLocalizacao } from '../data/storage'

function LoginPage({ onAuthenticated, onNavigate }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(event) {
    event.preventDefault()
    setErro('')
    const usuario = lerUsuario()
    if (!usuario) {
      setErro('ainda não existe um usuário salvo neste navegador.')
      return
    }
    if (email.trim().toLowerCase() !== usuario.email || senha !== usuario.senha) {
      setErro('e-mail ou senha não conferem.')
      return
    }
    setCarregando(true)
    const localizacao = await solicitarLocalizacao()
    const sessao = iniciarSessao(usuario, localizacao)
    setCarregando(false)
    onAuthenticated(sessao)
  }

  return <section className="auth-screen"><div className="auth-orbit" aria-hidden="true"><span /><span /><i>p</i></div><div className="auth-card glass-card"><span className="eyebrow"><span className="eyebrow-line" /> acesso seguro / demonstração</span><h1>volte para a <em>operação.</em></h1><p className="auth-lead">entre para retomar seu contexto e registrar a localização deste acesso.</p>{erro && <div className="error-feedback" role="alert"><strong>não rolou.</strong><span>{erro}</span></div>}<form onSubmit={entrar} noValidate><div className="field"><label htmlFor="login-email">e-mail<span>*</span></label><input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" autoComplete="email" /></div><div className="field"><label htmlFor="login-senha">senha<span>*</span></label><input id="login-senha" type="password" value={senha} onChange={(event) => setSenha(event.target.value)} placeholder="sua senha" autoComplete="current-password" /></div><button className="button-primary auth-submit" type="submit" disabled={carregando}>{carregando ? 'validando acesso...' : 'entrar no Plume'} <span>→</span></button></form><div className="auth-divider"><span>primeira vez aqui?</span></div><button className="button-ghost auth-register" type="button" onClick={() => onNavigate('usuarios')}>criar meu usuário</button><small className="auth-footnote">a localização é opcional. se você recusar, o acesso continua funcionando.</small></div></section>
}
export default LoginPage
