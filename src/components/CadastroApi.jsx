import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ImageCapture from './cadastros/ImageCapture'
import Field from './common/Field'
import { CADASTROS, nomeRegistro, opcaoNome } from '../config/cadastros'
import { apiConfig, cadastroApi, listaDaResposta } from '../services/api'

const vazio = {}
const PAGE_SIZE = 6

function valorInput(valor, tipo) {
  if (valor === null || valor === undefined) return ''
  if (tipo === 'datetime-local') return String(valor).slice(0, 16)
  if (tipo === 'date') return String(valor).slice(0, 10)
  return String(valor)
}

function normalizarNome(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function validar(recurso, config, form, imagem) {
  const erros = {}
  config.campos.forEach((campo) => {
    if (campo.obrigatorio && !String(form[campo.nome] ?? '').trim()) erros[campo.nome] = 'preencha este campo.'
  })
  if (config.imagem?.obrigatoria && !imagem) erros.foto = 'adicione uma imagem antes de salvar.'
  if (recurso === 'safra' && form.dataInicio && form.dataFim && form.dataFim < form.dataInicio) erros.dataFim = 'a data final não pode ser anterior à inicial.'
  if (recurso === 'medicao' && form.valor !== '' && !Number.isFinite(Number(form.valor))) erros.valor = 'informe um número válido.'
  if (recurso === 'medicao' && form.valor !== '' && Number(form.valor) < 0) erros.valor = 'o valor não pode ser negativo.'
  if (recurso === 'medicao' && form.data && !Number.isFinite(Date.parse(form.data))) erros.data = 'informe uma data válida.'
  return erros
}

function prepararPayload(config, form, imagem) {
  const payload = {}
  config.campos.forEach((campo) => {
    const valor = form[campo.nome] ?? ''
    payload[campo.nome] = campo.tipo === 'select' ? Number(valor) : campo.tipo === 'number' ? Number(valor) : campo.tipo === 'datetime-local' && valor.length === 16 ? `${valor}:00` : valor
  })
  if (imagem) payload.foto = imagem
  return payload
}

export default function CadastroApi({ recurso }) {
  const config = CADASTROS[recurso]
  const [lista, setLista] = useState([])
  const [opcoes, setOpcoes] = useState({})
  const [form, setForm] = useState(vazio)
  const [imagem, setImagem] = useState('')
  const [idEdicao, setIdEdicao] = useState(null)
  const [erros, setErros] = useState({})
  const [mensagem, setMensagem] = useState('')
  const [erroApi, setErroApi] = useState('')
  const [estado, setEstado] = useState('carregando')
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtros, setFiltros] = useState({})
  const [pagina, setPagina] = useState(1)
  const [resetImagem, setResetImagem] = useState(0)

  const carregar = useCallback(async () => {
    if (!config) return
    setEstado('carregando')
    setErroApi('')
    try {
      const origens = [...new Set(config.campos.filter((campo) => campo.origem).map((campo) => campo.origem))]
      const [dados, ...relacionamentos] = await Promise.all([
        cadastroApi.listar(recurso).then(listaDaResposta),
        ...origens.map((origem) => cadastroApi.listar(origem).then(listaDaResposta)),
      ])
      setLista(dados)
      setOpcoes(Object.fromEntries(origens.map((origem, index) => [origem, relacionamentos[index]])))
      setEstado('pronto')
    } catch (error) {
      setEstado('erro')
      setErroApi(error.message)
    }
  }, [config, recurso])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const filtrados = useMemo(() => {
    const termo = normalizarNome(busca.trim())
    return lista.filter((item) => {
      const texto = normalizarNome(nomeRegistro(recurso, item, opcoes)) + ' ' + config.campos.map((campo) => item[campo.nome]).join(' ')
      const passaBusca = !termo || normalizarNome(texto).includes(termo)
      const passaFiltros = (config.filtros || []).every((campo) => !filtros[campo] || String(item[campo]) === String(filtros[campo]))
      return passaBusca && passaFiltros
    })
  }, [busca, config, filtros, lista, opcoes, recurso])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const paginaItens = filtrados.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE)

  function alterar(event) {
    const { name, value } = event.target
    setForm((atual) => ({ ...atual, [name]: value }))
    setErros((atual) => ({ ...atual, [name]: '' }))
    setMensagem('')
  }

  function limpar() {
    setForm(vazio); setImagem(''); setIdEdicao(null); setErros({}); setMensagem(''); setResetImagem((valor) => valor + 1)
  }

  function editar(item) {
    setIdEdicao(item.Id)
    setForm(Object.fromEntries(config.campos.map((campo) => [campo.nome, valorInput(item[campo.nome], campo.tipo)])))
    setImagem(item.foto || '')
    setErros({}); setMensagem(''); setResetImagem((valor) => valor + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvar(event) {
    event.preventDefault()
    const novosErros = validar(recurso, config, form, imagem)
    setErros(novosErros)
    if (Object.keys(novosErros).length) { setMensagem(''); return }
    setSalvando(true); setErroApi(''); setMensagem('')
    try {
      const payload = prepararPayload(config, form, imagem)
      if (idEdicao === null) await cadastroApi.criar(recurso, payload)
      else await cadastroApi.atualizar(recurso, idEdicao, payload)
      await carregar()
      setMensagem(idEdicao === null ? 'registro criado e confirmado pela API.' : 'alterações salvas com sucesso.')
      limpar()
    } catch (error) { setErroApi(error.message) } finally { setSalvando(false) }
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir ${config.singular} “${nomeRegistro(recurso, item, opcoes)}”?`)) return
    setRemovendo(item.Id); setErroApi('')
    try { await cadastroApi.excluir(recurso, item.Id); setMensagem('registro removido do servidor.'); await carregar() }
    catch (error) { setErroApi(error.message) } finally { setRemovendo(null) }
  }

  if (!config) return <section className="empty-page"><h1>cadastro não encontrado.</h1></section>
  const titulo = idEdicao === null ? `novo registro de ${config.singular}.` : `editar ${config.singular}.`

  return <section className="cadastro-api-page">
    <div className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> {config.grupo} / {config.titulo.toLowerCase()}</span><h1>dados bem cuidados<br /><em>decidem melhor.</em></h1><p>{config.descricao} cada alteração é confirmada pelo servidor e fica pronta para a próxima etapa da operação.</p></div><div className="step-badge"><strong>{config.numero}</strong><span>de 06<br />CRUDs API</span></div></div>
    <div className="crud-layout">
      <div className="crud-form glass-card">
        <div className="card-heading"><div><span className="mini-label">formulário controlado</span><h2>{titulo}</h2></div><span className="required-note">* obrigatório</span></div>
        {mensagem && <div className="success-feedback" role="status"><span className="success-mark">✓</span>{mensagem}</div>}
        {erroApi && <div className="error-feedback" role="alert"><strong>operação não concluída.</strong><span>{erroApi}</span><button type="button" onClick={carregar}>tentar novamente</button></div>}
        <form onSubmit={salvar} noValidate><div className="crud-field-grid">{config.campos.map((campo) => <Field key={campo.nome} name={campo.nome} label={campo.rotulo} type={campo.tipo} placeholder={campo.tipo === 'select' ? 'selecione uma opção' : campo.placeholder} options={campo.origem ? (opcoes[campo.origem] || []).map((item) => ({ value: item.Id, label: nomeRegistro(campo.origem, item, opcoes) })) : null} value={form[campo.nome] ?? ''} error={erros[campo.nome]} onChange={alterar} />)}</div>{config.imagem && <ImageCapture key={resetImagem} tipo={recurso} label={config.imagem.rotulo} required={config.imagem.obrigatoria && idEdicao === null} initialImage={imagem} error={erros.foto} onImageChange={setImagem} />}{recurso === 'medicao' && <p className="form-hint api-hint"><span className="hint-dot" /> o valor será enviado como número e a data como ISO local.</p>}<div className="form-footer"><span className="form-hint"><span className="hint-dot" /> {salvando ? 'enviando para a API...' : `rota: ${apiConfig.rotas[recurso]}`}</span><div className="form-actions">{idEdicao !== null && <button className="button-ghost" type="button" onClick={limpar}>cancelar</button>}<button className="button-ghost" type="button" onClick={limpar}>limpar</button><button className="button-primary" type="submit" disabled={salvando}>{salvando ? 'salvando...' : idEdicao === null ? 'cadastrar registro' : 'salvar alterações'} <span>→</span></button></div></div></form>
      </div>
      <aside className="crud-aside"><span className="mini-label">fluxo de dados</span><strong>01</strong><p>cadastre a base primeiro. os relacionamentos aparecem nos selects seguintes, sem decorar IDs.</p><div className="api-status"><span className={estado === 'pronto' ? 'live-dot' : 'status-dot'} />{estado === 'pronto' ? 'API conectada' : estado === 'carregando' ? 'consultando API' : 'API requer atenção'}</div></aside>
    </div>
    <section className="crud-list glass-card"><div className="crud-list-header"><div><span className="mini-label">catálogo confirmado</span><h2>{filtrados.length} registro{filtrados.length === 1 ? '' : 's'} encontrado{filtrados.length === 1 ? '' : 's'}.</h2></div><label className="search-field"><span>⌕</span><input aria-label={`Buscar ${config.titulo}`} value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="buscar no catálogo" /></label></div>{config.filtros && <div className="crud-filters">{config.filtros.map((campo) => <select key={campo} aria-label={`Filtrar por ${campo}`} value={filtros[campo] || ''} onChange={(event) => { setFiltros((atual) => ({ ...atual, [campo]: event.target.value })); setPagina(1) }}><option value="">todos por {campo}</option>{(opcoes[campo] || []).map((item) => <option key={item.Id} value={item.Id}>{nomeRegistro(campo, item, opcoes)}</option>)}</select>)}</div>}{estado === 'carregando' && <div className="crud-empty"><span className="loading-bar" /><strong>consultando registros...</strong></div>}{estado === 'pronto' && !paginaItens.length && <div className="crud-empty"><strong>{lista.length ? 'nenhum registro combina com os filtros.' : 'nenhum registro cadastrado ainda.'}</strong><small>o primeiro registro criado pela API aparece aqui.</small></div>}{estado === 'pronto' && paginaItens.length > 0 && <div className="crud-records">{paginaItens.map((item) => <article className="crud-record" key={item.Id}><div className="crud-record-id">#{item.Id}</div><div className="crud-record-copy"><strong>{nomeRegistro(recurso, item, opcoes)}</strong><small>{config.campos.map((campo) => `${campo.rotulo}: ${campo.origem ? opcaoNome(opcoes[campo.origem], item[campo.nome]) : String(item[campo.nome] ?? '')}`).slice(0, 4).join(' · ')}</small></div><div className="crud-record-actions"><button type="button" onClick={() => editar(item)}>editar</button><button type="button" disabled={removendo === item.Id} onClick={() => excluir(item)}>{removendo === item.Id ? 'removendo' : 'excluir'}</button></div></article>)}</div>}{totalPaginas > 1 && <div className="crud-pagination"><button type="button" disabled={paginaAtual === 1} onClick={() => setPagina((valor) => valor - 1)}>← anterior</button><span>página {paginaAtual} de {totalPaginas}</span><button type="button" disabled={paginaAtual === totalPaginas} onClick={() => setPagina((valor) => valor + 1)}>próxima →</button></div>}</section>
  </section>
}
