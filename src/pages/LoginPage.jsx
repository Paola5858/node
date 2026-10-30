import React, { useState } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { authService } from '../services/authService'

const FOTO_CANAVIAL =
  'https://images.pexels.com/photos/38302386/pexels-photo-38302386.jpeg?auto=compress&cs=tinysrgb&w=1400'

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

  return (
    <section className="auth-split">
      <div className="auth-visual">
        <img
          src={FOTO_CANAVIAL}
          alt="Talhões de cana-de-açúcar sob céu aberto — foto de Joshuan Barboza no Pexels"
          width="1400"
          height="933"
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%' }}
        />

        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <strong>Cana Intelligence</strong>
        </div>

        <div className="auth-visual-copy">
          <h2>
            Indicadores industriais,
            <br />
            <em>da origem ao relatório.</em>
          </h2>
          <p>
            Medições de campo, importação validada e o relatório Power BI da usina
            em um acesso restrito à organização.
          </p>
        </div>

        <div className="auth-visual-foot">
          <ShieldCheck size={14} aria-hidden="true" />
          sessão validada no servidor
        </div>
      </div>

      <div className="auth-panel">
        <form className="auth-form" onSubmit={entrar} noValidate>
          <h1>
            volte para a <em>operação.</em>
          </h1>
          <p className="auth-lead">
            Suas credenciais são validadas pelo serviço de autenticação, nunca neste navegador.
          </p>

          {erro && (
            <div className="error-feedback" role="alert" aria-live="assertive">
              <strong>acesso não confirmado.</strong>
              <span>{erro}</span>
            </div>
          )}

          <div className="field">
            <label htmlFor="login-email">
              e-mail<span aria-hidden="true">*</span>
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@exemplo.com"
              autoComplete="username"
              required
              aria-required="true"
            />
          </div>

          <div className="field">
            <label htmlFor="login-senha">
              senha<span aria-hidden="true">*</span>
            </label>
            <input
              id="login-senha"
              name="senha"
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="sua senha"
              autoComplete="current-password"
              required
              aria-required="true"
            />
          </div>

          <button className="button-primary auth-submit" type="submit" disabled={carregando}>
            {carregando ? 'validando acesso...' : 'entrar no Cana Intelligence'}
            <ArrowRight size={15} aria-hidden="true" />
          </button>

          <div className="auth-links">
            <span>sem conta?</span>
            <button
              type="button"
              className="text-button"
              onClick={() => onNavigate?.('usuarios')}
            >
              solicitar cadastro <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>

          <small className="auth-footnote">
            a sessão só começa após confirmação do servidor.
          </small>
        </form>
      </div>
    </section>
  )
}

export default LoginPage
