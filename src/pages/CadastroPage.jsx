import React, { useMemo, useState } from 'react'
import { catalogo } from '../constants/catalogos'
import Field from '../components/common/Field'
import ImageCapture from '../components/cadastros/ImageCapture'
import { validarCadastro } from '../validation/cadastroSchema'

function CadastroPage({ tipo }) {
  const config = catalogo[tipo] || catalogo.safra
  const initialState = useMemo(() => Object.fromEntries(config.fields.map(([key]) => [key, ''])), [config])
  const [valores, setValores] = useState(initialState)
  const [erros, setErros] = useState({})
  const [mensagem, setMensagem] = useState('')
  const [imagemSelecionada, setImagemSelecionada] = useState(false)
  const [imageResetSignal, setImageResetSignal] = useState(0)

  function atualizarCampo(event) {
    const { name, value } = event.target
    setValores((atual) => ({ ...atual, [name]: value }))
    if (erros[name]) setErros((atual) => ({ ...atual, [name]: '' }))
    setMensagem('')
  }

  function salvar(event) {
    event.preventDefault()
    const novosErros = validarCadastro(config, valores, imagemSelecionada)
    setErros(novosErros)
    if (Object.keys(novosErros).length) { setMensagem(''); return }
    setMensagem(`registro não salvo: a API de persistência para ${tipo} não está disponível neste repositório.`)
  }

  function limpar() {
    setValores(initialState)
    setErros({})
    setMensagem('')
    setImagemSelecionada(false)
    setImageResetSignal((signal) => signal + 1)
  }

  function alterarImagem(selecionada) {
    setImagemSelecionada(selecionada)
    if (selecionada && erros.foto) setErros((atual) => ({ ...atual, foto: '' }))
  }

  return (
    <section className="cadastro-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" /> {config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div className="step-badge"><strong>{config.numero}</strong><span>de 07<br />cadastros</span></div>
      </div>
      <div className="form-layout">
        <div className="form-card glass-card">
          <div className="card-heading"><div><span className="mini-label">atributos da classe</span><h2>vamos criar esse registro.</h2></div><span className="required-note">* campos obrigatórios</span></div>
          {mensagem && <div className="error-feedback" role="alert"><strong>operação não concluída.</strong><span>{mensagem}</span></div>}
          <form onSubmit={salvar} noValidate>
            <div className="form-grid">
              {config.fields.map(([key, label, type, extra]) => <Field key={key} name={key} label={label} type={type} placeholder={Array.isArray(extra) ? 'selecione uma opção' : extra} options={Array.isArray(extra) ? extra : null} value={valores[key]} error={erros[key]} onChange={atualizarCampo} />)}
            </div>
            <ImageCapture key={imageResetSignal} tipo={tipo} label={config.imagemLabel} required={config.imagemObrigatoria} error={erros.foto} onImageChange={alterarImagem} />
            <div className="form-footer"><span className="form-hint"><span className="hint-dot" /> o cadastro depende de uma API persistente.</span><div className="form-actions"><button type="button" className="button-ghost" onClick={limpar}>limpar</button><button type="submit" className="button-primary">cadastrar registro <span>→</span></button></div></div>
          </form>
        </div>
        <aside className="form-aside"><span className="mini-label">fluxo sugerido</span><div className="aside-orbit"><span className="orbit-dot" /><span className="orbit-line" /><strong>01</strong></div><p>comece pelo essencial. o restante ganha forma a partir daqui.</p></aside>
      </div>
    </section>
  )
}

export default CadastroPage
