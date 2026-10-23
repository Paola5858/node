import { apiFetch } from './sessionToken'

const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const endpoint = `${apiBase}/indicador`
const TIMEOUT_MS = 10_000

async function requisicao(url, opcoes = {}) {
  const controller = new AbortController()
  const sinalExterno = opcoes.signal
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const abortar = () => controller.abort(sinalExterno?.reason)
  if (sinalExterno?.aborted) abortar()
  else sinalExterno?.addEventListener('abort', abortar, { once: true })

  try {
    const resposta = await apiFetch(url, {
      ...opcoes,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
        ...opcoes.headers,
      },
    })
    const texto = await resposta.text()

    // O deadline inclui a leitura do corpo, que pode bloquear mesmo após os headers.
    if (!resposta.ok) {
      let mensagem = null
      try {
        const dados = JSON.parse(texto)
        mensagem = dados?.message || dados?.erro || dados?.error || null
      } catch { /* respostas de erro sem JSON usam o status HTTP */ }
      throw new Error(mensagem || `erro HTTP ${resposta.status}`)
    }

    if (!texto.trim()) return null
    try {
      return JSON.parse(texto)
    } catch {
      throw new Error('a API respondeu um conteúdo inválido. confira a rota /api/indicador.')
    }
  } catch (e) {
    if (sinalExterno?.aborted) throw e
    if (controller.signal.aborted || e?.name === 'AbortError') {
      throw new Error(`a API não respondeu em ${TIMEOUT_MS / 1000} s. verifique se o servidor do Plume está ativo.`)
    }
    if (e instanceof SyntaxError) throw e
    if (e instanceof Error && (e.message.startsWith('erro HTTP ') || e.message === 'a API respondeu um conteúdo inválido. confira a rota /api/indicador.')) throw e
    if (e instanceof TypeError) {
      throw new Error('não foi possível conectar à API de indicadores. verifique se o servidor do Plume está ativo.')
    }
    throw e
  } finally {
    clearTimeout(timer)
    sinalExterno?.removeEventListener('abort', abortar)
  }
}

function validarLista(dados) {
  if (!Array.isArray(dados)) throw new Error('a API não retornou uma lista de indicadores.')
  return dados
}

export const indicadorService = {
  async listar(opcoes = {}) {
    return validarLista(await requisicao(endpoint, opcoes))
  },
  consultar(id, opcoes = {}) {
    return requisicao(`${endpoint}/${encodeURIComponent(id)}`, opcoes)
  },
  cadastrar(dados, opcoes = {}) {
    return requisicao(endpoint, { ...opcoes, method: 'POST', body: JSON.stringify(dados) })
  },
  atualizar(id, dados, opcoes = {}) {
    return requisicao(`${endpoint}/${encodeURIComponent(id)}`, { ...opcoes, method: 'PUT', body: JSON.stringify(dados) })
  },
  excluir(id, opcoes = {}) {
    return requisicao(`${endpoint}/${encodeURIComponent(id)}`, { ...opcoes, method: 'DELETE' })
  },
  endpoint,
}

export function normalizarIndicador(item) {
  return {
    Id: item?.Id ?? item?.id,
    Nome: String(item?.Nome ?? item?.nome ?? '').trim(),
    Descricao: String(item?.Descricao ?? item?.descricao ?? '').trim(),
    Url: String(item?.Url ?? item?.url ?? '').trim(),
  }
}
