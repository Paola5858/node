import { useState } from 'react'
import ImageCapture from '../components/cadastros/ImageCapture'
import { lerUsuario, salvarUsuario } from '../data/storage'

const initialState = { nome: '', email: '', senha: '', confirmarSenha: '' }

function validar(valores, foto) {
  const erros = {}
  if (!valores.nome.trim()) erros.nome = 'informe seu nome'
  if (!valores.email.trim()) erros.email = 'informe seu e-mail'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email)) erros.email = 'use um e-mail válido'
  if (valores.senha.length < 6) erros.senha = 'use pelo menos 6 caracteres'
  if (valores.senha !== valores.confirmarSenha) erros.confirmarSenha = 'as senhas não coincidem'
  if (!foto) erros.foto = 'selecione ou capture uma foto'
  return erros
}

function UsuariosPage({ onNavigate }) {
  const usuarioExistente = lerUsuario()
  const [valores, setValores] = useState(initialState)
  const [foto, setFoto] = useState(usuarioExistente?.foto || '')
  const [erros, setErros] = useState({})
  const [mensagem, setMensagem] = useState('')
  const [resetFoto, setResetFoto] = useState(0)

  function atualizar(event) {
    const { name, value } = event.target
    setValores((atual) => ({ ...atual, [name]: value }))
    setErros((atual) => ({ ...atual, [name]: '' }))
    setMensagem('')
  }

  function salvar(event) {
    event.preventDefault()
    const novosErros = validar(valores, foto)
    setErros(novosErros)
    if (Object.keys(novosErros).length) return
    salvarUsuario({ nome: valores.nome.trim(), email: valores.email.trim().toLowerCase(), senha: valores.senha, foto })
    setMensagem('usuário salvo no navegador. agora o acesso já pode ser testado.')
    setValores(initialState)
    setFoto('')
    setResetFoto((valor) => valor + 1)
    setTimeout(() => onNavigate('login'), 1500)
  }

  function alterarFoto(valor) {
    setFoto(valor || '')
    setErros((atual) => ({ ...atual, foto: '' }))
  }

  return <section className="cadastro-page auth-page">
    <div className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> acesso / identidade</span><h1>cadastro de <em>usuário.</em></h1><p>crie a identidade que vai organizar seu acesso ao workspace Plume.</p></div><div className="step-badge"><strong>08</strong><span>perfil<br />de acesso</span></div></div>
    <div className="form-layout"><div className="form-card glass-card"><div className="card-heading"><div><span className="mini-label">dados da conta</span><h2>vamos deixar isso pessoal.</h2></div><span className="required-note">* campos obrigatórios</span></div>
      {mensagem && <div className="success-feedback" role="status"><span className="success-mark">✓</span><div><strong>registro concluído.</strong><span>{mensagem}</span></div></div>}
      <form onSubmit={salvar} noValidate><div className="form-grid">
        <div className={`field ${erros.nome ? 'has-error' : ''}`}><label htmlFor="nome">nome<span>*</span></label><input id="nome" name="nome" autoComplete="name" value={valores.nome} onChange={atualizar} placeholder="ex.: Paola Soares" />{erros.nome && <small className="field-error">{erros.nome}</small>}</div>
        <div className={`field ${erros.email ? 'has-error' : ''}`}><label htmlFor="email">e-mail<span>*</span></label><input id="email" name="email" type="email" autoComplete="email" value={valores.email} onChange={atualizar} placeholder="voce@exemplo.com" />{erros.email && <small className="field-error">{erros.email}</small>}</div>
        <div className={`field ${erros.senha ? 'has-error' : ''}`}><label htmlFor="senha">senha<span>*</span></label><input id="senha" name="senha" type="password" autoComplete="new-password" value={valores.senha} onChange={atualizar} placeholder="mínimo de 6 caracteres" />{erros.senha && <small className="field-error">{erros.senha}</small>}</div>
        <div className={`field ${erros.confirmarSenha ? 'has-error' : ''}`}><label htmlFor="confirmarSenha">confirmar senha<span>*</span></label><input id="confirmarSenha" name="confirmarSenha" type="password" autoComplete="new-password" value={valores.confirmarSenha} onChange={atualizar} placeholder="repita sua senha" />{erros.confirmarSenha && <small className="field-error">{erros.confirmarSenha}</small>}</div>
      </div><ImageCapture key={resetFoto} tipo="usuario" label="foto do usuário" required error={erros.foto} onImageChange={alterarFoto} /><div className="storage-note"><strong>nota de aula:</strong> os dados ficam no Web Storage apenas para demonstrar o fluxo. em produção, senha nunca deve ser guardada assim.</div><div className="form-footer"><span className="form-hint"><span className="hint-dot" /> localStorage ativo neste exercício.</span><div className="form-actions"><button type="button" className="button-ghost" onClick={() => onNavigate('login')}>já tenho acesso</button><button type="submit" className="button-primary">salvar usuário <span>→</span></button></div></div></form>
    </div><aside className="form-aside"><span className="mini-label">o que acontece depois</span><div className="aside-orbit"><span className="orbit-dot" /><span className="orbit-line" /><strong>login</strong></div><p>a sessão atual vive só nesta aba. fechou a aba, acabou o passe livre.</p></aside></div>
  </section>
}
export default UsuariosPage
