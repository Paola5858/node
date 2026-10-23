import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { indicadorService, normalizarIndicador } from '../services/indicadorService'
import VisualizarIndicador from '../components/VisualizarIndicador'

const vazio = { Nome: '', Descricao: '', Url: '' }
const favoritosKey = 'plume.indicadores.favoritos'

function lerFavoritos() {
  try { return JSON.parse(localStorage.getItem(favoritosKey) || '[]') } catch { return [] }
}

function validar(form) {
  const erros = {}
  if (!form.Nome.trim()) erros.Nome = 'informe o nome do indicador'
  if (!form.Descricao.trim()) erros.Descricao = 'explique o que este indicador representa'
  if (!form.Url.trim()) erros.Url = 'informe a URL do painel'
  else {
    try {
      const url = new URL(form.Url)
      if (!['http:', 'https:'].includes(url.protocol)) erros.Url = 'use uma URL iniciando com http:// ou https://'
    } catch { erros.Url = 'informe uma URL válida' }
  }
  return erros
}

function normalizarTexto(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function IndicadoresPage({ initialSelectedId, onItemsChange, onSelect }) {
  const [itens, setItens] = useState([])
  const [form, setForm] = useState(vazio)
  const [idEdicao, setIdEdicao] = useState(null)
  const [selecionado, setSelecionado] = useState(null)
  const [busca, setBusca] = useState('')
  const [favoritos, setFavoritos] = useState(lerFavoritos)
  const [estado, setEstado] = useState('carregando')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(null)

  // Ref sempre atual para os itens — permite ler o estado corrente dentro de
  // efeitos que não devem re-executar ao mudar itens (F-05).
  const itensRef = useRef(itens)
  useEffect(() => { itensRef.current = itens }, [itens])
  const selecaoPendenteRef = useRef(null)

  function selecionarIndicador(item) {
    setSelecionado(item)
    onSelect?.(item)
  }

  // carregar: NÃO depende de initialSelectedId para evitar chamadas extras à API
  // quando o usuário clica em itens do menu enquanto já está nesta tela (F-05).
  const carregar = useCallback(async () => {
    setEstado('carregando')
    setErro('')
    try {
      const dados = await indicadorService.listar()
      const normalizados = dados.map(normalizarIndicador).filter((item) => item.Id !== undefined && item.Id !== null)
      setItens(normalizados)
      onItemsChange?.(normalizados)
      // Preserva a seleção atual se o item ainda existir na lista atualizada.
      setSelecionado((atual) => {
        const mantido = normalizados.find((item) => String(item.Id) === String(atual?.Id)) ?? null
        if (!mantido && atual) onSelect?.(null)
        return mantido
      })
      setEstado('pronto')
    } catch (error) {
      selecaoPendenteRef.current = null
      setEstado('erro')
      setErro(error.message)
      setSelecionado(null)
      onSelect?.(null)
    }
  }, [onItemsChange, onSelect])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  // Sincroniza a seleção quando initialSelectedId muda (clique no menu lateral)
  // sem disparar uma nova chamada à API.
  useEffect(() => {
    if (initialSelectedId === undefined || initialSelectedId === null) return
    if (estado === 'carregando' || estado === 'erro') {
      selecaoPendenteRef.current = initialSelectedId
      return
    }
    if (estado !== 'pronto') return
    selecaoPendenteRef.current = null
    const encontrado = itensRef.current.find((item) => String(item.Id) === String(initialSelectedId)) ?? null
    setSelecionado(encontrado)
    onSelect?.(encontrado)
  }, [initialSelectedId, estado, itens, onSelect])

  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca.trim())
    return itens.filter((item) => {
      if (!termo) return true
      const nome = normalizarTexto(item.Nome)
      const desc = normalizarTexto(item.Descricao)
      return nome.includes(termo) || desc.includes(termo)
    })
  }, [busca, itens])

  function alterar(event) {
    const { name, value } = event.target
    setForm((atual) => ({ ...atual, [name]: value }))
    setErros((atual) => ({ ...atual, [name]: '' }))
    setMensagem('')
  }

  function prepararEdicao(item) {
    setIdEdicao(item.Id)
    setForm({ Nome: item.Nome, Descricao: item.Descricao, Url: item.Url })
    setErros({})
    setMensagem('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function limpar() {
    setIdEdicao(null)
    setForm(vazio)
    setErros({})
    setMensagem('')
  }

  async function salvar(event) {
    event.preventDefault()
    const novosErros = validar(form)
    setErros(novosErros)
    if (Object.keys(novosErros).length) return
    setSalvando(true)
    setErro('')
    try {
      if (idEdicao === null) await indicadorService.cadastrar(form)
      else await indicadorService.atualizar(idEdicao, form)
      await carregar()
      setIdEdicao(null)
      setForm(vazio)
      setErros({})
      setMensagem(idEdicao === null ? 'indicador criado e menu atualizado.' : 'indicador atualizado com sucesso.')
    } catch (error) { setErro(error.message) } finally { setSalvando(false) }
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir o indicador "${item.Nome}"?`)) return
    setExcluindo(item.Id)
    setErro('')
    try {
      await indicadorService.excluir(item.Id)
      setFavoritos((atual) => atual.filter((id) => String(id) !== String(item.Id)))
      // carregar() já remove o item excluído da lista e limpa selecionado caso
      // o item deletado fosse o selecionado (F-07).
      await carregar()
      setMensagem('indicador removido.')
    } catch (error) { setErro(error.message) } finally { setExcluindo(null) }
  }

  function alternarFavorito(id) {
    setFavoritos((atual) => {
      const proximo = atual.some((item) => String(item) === String(id))
        ? atual.filter((item) => String(item) !== String(id))
        : [...atual, id]
      localStorage.setItem(favoritosKey, JSON.stringify(proximo))
      return proximo
    })
  }

  return (
    <section className="indicadores-page">
      {/* Cabeçalho da página */}
      <div className="page-intro">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" /> inteligência / indicadores</span>
          <h1>dados que viram <em>direção.</em></h1>
          <p>cadastre os painéis que ajudam sua operação a decidir com menos ruído e mais contexto.</p>
        </div>
        <div className="step-badge"><strong>07</strong><span>indicadores<br />do domínio</span></div>
      </div>

      <div className="indicator-grid">
        {/* Coluna principal: lista + visualizador */}
        <div className="indicator-main">
          {/* Barra de ferramentas */}
          <div className="glass-card indicator-toolbar">
            <div>
              <span className="mini-label">catálogo conectado</span>
              <h2>{itens.length} indicador{itens.length === 1 ? '' : 'es'}</h2>
            </div>
            <div className="indicator-actions">
              <label className="search-field">
                <span>⌕</span>
                <input
                  aria-label="Buscar indicador"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="buscar por nome"
                />
              </label>
              <button className="button-ghost" type="button" onClick={carregar}>atualizar</button>
            </div>
          </div>

          {/* Estado: carregando */}
          {estado === 'carregando' && (
            <div className="indicator-state">
              <span className="loading-bar" />
              <strong>consultando sua API...</strong>
              <small>buscando indicadores no Node-RED.</small>
            </div>
          )}

          {/* Estado: erro de comunicação */}
          {estado === 'erro' && (
            <div className="indicator-state state-error">
              <strong>não consegui falar com a API.</strong>
              <small>{erro}</small>
              <code>{indicadorService.endpoint}</code>
              <button className="button-primary" type="button" onClick={carregar}>
                tentar novamente <span>↗</span>
              </button>
            </div>
          )}

          {/* Estado: pronto, sem resultados */}
          {estado === 'pronto' && !filtrados.length && (
            <div className="indicator-state">
              <strong>{itens.length ? 'nenhum resultado para essa busca.' : 'seu catálogo ainda está vazio.'}</strong>
              <small>{itens.length ? 'tente outro nome ou limpe a busca.' : 'cadastre o primeiro indicador no formulário ao lado.'}</small>
            </div>
          )}

          {/* Lista de indicadores */}
          {estado === 'pronto' && filtrados.length > 0 && (
            <div className="indicator-list">
              {filtrados.map((item) => (
                <article
                  className={`indicator-item ${selecionado?.Id === item.Id ? 'selected' : ''}`}
                  key={item.Id}
                  onClick={() => selecionarIndicador(item)}
                >
                  <button
                    className={`favorite-button ${favoritos.some((id) => String(id) === String(item.Id)) ? 'is-favorite' : ''}`}
                    type="button"
                    onClick={(event) => { event.stopPropagation(); alternarFavorito(item.Id) }}
                    aria-label="Alternar favorito"
                  >
                    {favoritos.some((id) => String(id) === String(item.Id)) ? '★' : '☆'}
                  </button>
                  <div className="indicator-item-copy">
                    <strong>{item.Nome}</strong>
                    <small>{item.Descricao}</small>
                    <span>{item.Url}</span>
                  </div>
                  <div className="indicator-item-actions">
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); prepararEdicao(item) }}
                    >
                      editar
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); excluir(item) }}
                      disabled={excluindo === item.Id}
                    >
                      {excluindo === item.Id ? 'removendo' : 'excluir'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Visualizador do painel selecionado com botão de fechar/retornar à lista (R16) */}
          {selecionado && (
            <VisualizarIndicador
              key={`${selecionado.Id}:${selecionado.Url}`}
              indicador={selecionado}
              onVoltar={() => selecionarIndicador(null)}
            />
          )}
        </div>

        {/* Coluna lateral: formulário */}
        <aside className="glass-card indicator-form-card">
          <div className="card-heading">
            <div>
              <span className="mini-label">{idEdicao === null ? 'novo registro' : 'modo edição'}</span>
              <h2>{idEdicao === null ? 'adicionar indicador.' : 'ajustar indicador.'}</h2>
            </div>
            {idEdicao !== null && (
              <button className="text-button" type="button" onClick={limpar}>cancelar</button>
            )}
          </div>

          {mensagem && (
            <div className="success-feedback" role="status">
              <span className="success-mark">✓</span>
              <span>{mensagem}</span>
            </div>
          )}

          {erro && estado !== 'erro' && (
            <div className="error-feedback" role="alert">
              <strong>operação não concluída.</strong>
              <span>{erro}</span>
            </div>
          )}

          <form onSubmit={salvar} noValidate>
            <div className={`field ${erros.Nome ? 'has-error' : ''}`}>
              <label htmlFor="Nome">nome<span>*</span></label>
              <input id="Nome" name="Nome" value={form.Nome} onChange={alterar} placeholder="ex.: produção diária" />
              {erros.Nome && <small className="field-error">{erros.Nome}</small>}
            </div>

            <div className={`field ${erros.Descricao ? 'has-error' : ''}`}>
              <label htmlFor="Descricao">descrição<span>*</span></label>
              <textarea id="Descricao" name="Descricao" value={form.Descricao} onChange={alterar} placeholder="o que este painel acompanha?" rows="4" />
              {erros.Descricao && <small className="field-error">{erros.Descricao}</small>}
            </div>

            <div className={`field ${erros.Url ? 'has-error' : ''}`}>
              <label htmlFor="Url">URL do painel<span>*</span></label>
              <input id="Url" name="Url" type="url" value={form.Url} onChange={alterar} placeholder="https://app.powerbi.com/view?r=..." />
              {erros.Url && <small className="field-error">{erros.Url}</small>}
            </div>

            <div className="powerbi-hint">
              <span className="live-dot" />
              <div>
                <strong>Incorporação do relatório</strong>
                <small>Confirme as permissões e a política de compartilhamento antes de usar um link.</small>
              </div>
            </div>

            <button className="button-primary form-submit" type="submit" disabled={salvando}>
              {salvando ? 'salvando...' : idEdicao === null ? 'cadastrar indicador' : 'salvar alterações'} <span>→</span>
            </button>
          </form>
        </aside>
      </div>
    </section>
  )
}

export default IndicadoresPage
