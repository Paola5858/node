import React, { useEffect, useMemo, useState } from 'react'
import { catalogo } from '../constants/catalogos'
import Field from '../components/common/Field'
import ImageCapture from '../components/cadastros/ImageCapture'
import { validarCadastro } from '../validation/cadastroSchema'
import { cadastroService } from '../services/cadastroService'

const dependencias = {
  equipamento: { unidade: 'unidade' },
  medicao: { safra: 'safra', equipamento: 'equipamento', tipoInformacao: 'tipoinformacao' },
  tipoinformacao: { unidadeMedida: 'unidademedida' },
}

function nomeRegistro(registro) {
  return registro.nomeSafra || registro.nome || registro.Nome || `registro ${registro.Id}`
}

function CadastroPage({ tipo }) {
  const config = catalogo[tipo] || catalogo.safra
  const initialState = useMemo(() => Object.fromEntries(config.fields.map(([key]) => [key, ''])), [config])
  const [valores, setValores] = useState(initialState)
  const [erros, setErros] = useState({})
  const [mensagem, setMensagem] = useState('')
  const [imagemSelecionada, setImagemSelecionada] = useState('')
  const [opcoesRelacao, setOpcoesRelacao] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [registros, setRegistros] = useState([])
  const [idEdicao, setIdEdicao] = useState(null)
  const [imageResetSignal, setImageResetSignal] = useState(0)

  useEffect(() => {
    let ativo = true
    const relacoes = dependencias[tipo] || {}
    Promise.all([
      cadastroService.listar(tipo).then((itens) => { if (ativo) setRegistros(itens) }),
      ...Object.entries(relacoes).map(async ([campo, tipoRelacionamento]) => {
      const itens = await cadastroService.listar(tipoRelacionamento)
      return [campo, itens.map((item) => ({ value: item.Id, label: nomeRegistro(item) }))]
      }),
    ]).then(([, ...itens]) => { if (ativo) setOpcoesRelacao(Object.fromEntries(itens)) })
      .catch((error) => { if (ativo) setMensagem(`não foi possível consultar os registros no servidor: ${error.message}`) })
    return () => { ativo = false }
  }, [tipo])

  function atualizarCampo(event) {
    const { name, value } = event.target
    setValores((atual) => ({ ...atual, [name]: value }))
    if (erros[name]) setErros((atual) => ({ ...atual, [name]: '' }))
    setMensagem('')
  }

  async function salvar(event) {
    event.preventDefault()
    const novosErros = validarCadastro(config, valores, imagemSelecionada)
    setErros(novosErros)
    if (Object.keys(novosErros).length) { setMensagem(''); return }
    setSalvando(true)
    const payload = { ...valores, ...(imagemSelecionada ? { foto: imagemSelecionada } : {}) }
    try {
      if (idEdicao === null) await cadastroService.criar(tipo, payload)
      else await cadastroService.atualizar(tipo, idEdicao, payload)
      const atualizados = await cadastroService.listar(tipo)
      setRegistros(atualizados)
      limpar()
      setMensagem(idEdicao === null ? 'registro salvo e confirmado pelo servidor.' : 'alterações salvas no servidor.')
    } catch (error) {
      setMensagem(`registro não salvo: ${error.message}`)
    } finally { setSalvando(false) }
  }

  function limpar() {
    setValores(initialState)
    setErros({})
    setMensagem('')
    setImagemSelecionada('')
    setImageResetSignal((signal) => signal + 1)
    setIdEdicao(null)
  }

  function editar(registro) {
    setIdEdicao(registro.Id)
    setValores(Object.fromEntries(config.fields.map(([key]) => [key, registro[key] === undefined ? '' : String(registro[key])])) )
    setImagemSelecionada(registro.foto || '')
    setImageResetSignal((signal) => signal + 1)
    setErros({})
    setMensagem('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function excluir(registro) {
    const descricao = nomeRegistro(registro)
    if (!window.confirm(`Excluir o registro "${descricao}"?`)) return
    setSalvando(true)
    setMensagem('')
    try {
      await cadastroService.excluir(tipo, registro.Id)
      setRegistros((atuais) => atuais.filter((item) => item.Id !== registro.Id))
      if (idEdicao === registro.Id) limpar()
      setMensagem('registro removido do servidor.')
    } catch (error) { setMensagem(`registro não removido: ${error.message}`) } finally { setSalvando(false) }
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
          <div className="card-heading"><div><span className="mini-label">atributos da classe</span><h2>{idEdicao === null ? 'vamos criar esse registro.' : 'editar registro.'}</h2></div><span className="required-note">* campos obrigatórios</span></div>
          {mensagem && (mensagem.startsWith('registro salvo') ? <div className="success-feedback" role="status">{mensagem}</div> : <div className="error-feedback" role="alert"><strong>operação não concluída.</strong><span>{mensagem}</span></div>)}
          <form onSubmit={salvar} noValidate>
            <div className="form-grid">
              {config.fields.map(([key, label, type, extra]) => <Field key={key} name={key} label={label} type={type} placeholder={Array.isArray(extra) ? 'selecione uma opção' : extra} options={Array.isArray(extra) ? (extra.length ? extra : opcoesRelacao[key] || []) : null} value={valores[key]} error={erros[key]} onChange={atualizarCampo} />)}
            </div>
            <ImageCapture key={imageResetSignal} tipo={tipo} label={config.imagemLabel} required={config.imagemObrigatoria} initialImage={imagemSelecionada} error={erros.foto} onImageChange={alterarImagem} />
            <div className="form-footer"><span className="form-hint"><span className="hint-dot" /> {salvando ? 'salvando no servidor...' : 'a API confirma cada gravação.'}</span><div className="form-actions">{idEdicao !== null && <button type="button" className="button-ghost" onClick={limpar}>cancelar edição</button>}<button type="button" className="button-ghost" onClick={limpar}>limpar</button><button type="submit" className="button-primary" disabled={salvando}>{salvando ? 'salvando...' : idEdicao === null ? 'cadastrar registro' : 'salvar alterações'} <span>→</span></button></div></div>
          </form>
        </div>
        <aside className="form-aside"><span className="mini-label">fluxo sugerido</span><div className="aside-orbit"><span className="orbit-dot" /><span className="orbit-line" /><strong>01</strong></div><p>comece pelo essencial. o restante ganha forma a partir daqui.</p></aside>
      </div>
      <section className="catalog-records glass-card" aria-labelledby="records-heading">
        <div className="card-heading"><div><span className="mini-label">registros confirmados</span><h2 id="records-heading">{registros.length} item{registros.length === 1 ? '' : 's'} no catálogo.</h2></div></div>
        {registros.length ? <div className="catalog-record-list">{registros.map((registro) => <article className="catalog-record" key={registro.Id}><div><strong>{nomeRegistro(registro)}</strong><small>{config.fields.filter(([key]) => key !== 'foto' && registro[key] !== undefined).slice(0, 3).map(([key, label]) => `${label}: ${String(registro[key])}`).join(' · ')}</small></div><div className="catalog-record-actions"><button type="button" onClick={() => editar(registro)}>editar</button><button type="button" disabled={salvando} onClick={() => excluir(registro)}>excluir</button></div></article>)}</div> : <p className="catalog-empty">Nenhum registro salvo ainda. O catálogo é atualizado após a confirmação da API.</p>}
      </section>
    </section>
  )
}

export default CadastroPage
