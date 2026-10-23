import React, { useState } from 'react'
import { authService } from '../services/authService'

function UsuariosPage({ onNavigate }) {
  const [valores, setValores] = useState({ nome: '', organizationName: '', email: '', senha: '', confirmarSenha: '' })
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  function atualizar(event) {
    setValores((atual) => ({ ...atual, [event.target.name]: event.target.value }))
    setErro('')
    setMensagem('')
  }

  async function salvar(event) {
    event.preventDefault()
    if (!valores.nome.trim() || !valores.organizationName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email)) return setErro('informe nome, organização e um e-mail válido.')
    if (valores.senha.length < 12) return setErro('use uma senha com pelo menos 12 caracteres.')
    if (valores.senha !== valores.confirmarSenha) return setErro('as senhas não coincidem.')
    setSalvando(true)
    setErro('')
    try {
      await authService.cadastrar({ nome: valores.nome.trim(), organizationName: valores.organizationName.trim(), email: valores.email.trim().toLowerCase(), senha: valores.senha })
      setMensagem('organização e conta do responsável criadas no servidor. entre para iniciar uma sessão.')
      setValores({ nome: '', organizationName: '', email: '', senha: '', confirmarSenha: '' })
    } catch (error) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  return <section className="cadastro-page auth-page">
    <div className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> acesso / identidade</span><h1>solicitar <em>acesso.</em></h1><p>o cadastro só é concluído quando a API de autenticação confirma a criação da conta.</p></div></div>
    <div className="form-layout"><div className="form-card glass-card"><div className="card-heading"><div><span className="mini-label">conta no servidor</span><h2>dados de acesso.</h2></div></div>
      {mensagem && <div className="success-feedback" role="status">{mensagem}</div>}
      {erro && <div className="error-feedback" role="alert">{erro}</div>}
      <form onSubmit={salvar} noValidate><div className="form-grid">
        <div className="field"><label htmlFor="nome">nome<span>*</span></label><input id="nome" name="nome" autoComplete="name" value={valores.nome} onChange={atualizar} required /></div>
        <div className="field"><label htmlFor="organizationName">organização / usina<span>*</span></label><input id="organizationName" name="organizationName" autoComplete="organization" value={valores.organizationName} onChange={atualizar} required /></div>
        <div className="field"><label htmlFor="email">e-mail<span>*</span></label><input id="email" name="email" type="email" autoComplete="email" value={valores.email} onChange={atualizar} required /></div>
        <div className="field"><label htmlFor="senha">senha<span>*</span></label><input id="senha" name="senha" type="password" autoComplete="new-password" value={valores.senha} onChange={atualizar} required /></div>
        <div className="field"><label htmlFor="confirmarSenha">confirmar senha<span>*</span></label><input id="confirmarSenha" name="confirmarSenha" type="password" autoComplete="new-password" value={valores.confirmarSenha} onChange={atualizar} required /></div>
      </div><div className="storage-note">A senha é enviada apenas à API de autenticação e não é salva no Web Storage. O servidor precisa armazená-la usando hash de senha e política segura de sessão.</div><div className="form-footer"><span className="form-hint">cadastro remoto</span><div className="form-actions"><button type="button" className="button-ghost" onClick={() => onNavigate('login')}>já tenho acesso</button><button type="submit" className="button-primary" disabled={salvando}>{salvando ? 'enviando...' : 'solicitar acesso'} <span>→</span></button></div></div></form>
    </div></div>
  </section>
}
export default UsuariosPage
