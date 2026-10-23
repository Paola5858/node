const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const endpoint = `${apiBase}/indicador`
const TIMEOUT_MS = 10_000

async function requisicao(url, opcoes = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let resposta
  try {
    resposta = await fetch(url, {
      ...opcoes,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
        ...opcoes.headers,
      },
    })
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(`a API não respondeu em ${TIMEOUT_MS / 1000} s. verifique se o Node-RED está ativo.`)
    }
    throw new Error('não foi possível conectar à API de indicadores. verifique se o Node-RED está ativo.')
  } finally {
    clearTimeout(timer)
  }

  const texto = await resposta.text()

  // Verifica status antes de tentar interpretar o corpo — erros HTTP com corpo HTML
  // teriam lançado "conteúdo inválido" antes; agora mostram "erro HTTP 404" etc.
  if (!resposta.ok) {
    let mensagem = null
    try {
      const dados = JSON.parse(texto)
      mensagem = dados?.message || dados?.erro || dados?.error || null
    } catch { /* corpo não é JSON — usa mensagem genérica */ }
    throw new Error(mensagem || `erro HTTP ${resposta.status}`)
  }

  if (!texto.trim()) return null
  try {
    return JSON.parse(texto)
  } catch {
    throw new Error('a API respondeu um conteúdo inválido. confira a rota /api/indicador.')
  }
}

function validarLista(dados) {
  if (!Array.isArray(dados)) throw new Error('a API não retornou uma lista de indicadores.')
  return dados
}

export const indicadorService = {
  async listar() {
    return validarLista(await requisicao(endpoint))
  },
  consultar(id) {
    return requisicao(`${endpoint}/${encodeURIComponent(id)}`)
  },
  cadastrar(dados) {
    return requisicao(endpoint, { method: 'POST', body: JSON.stringify(dados) })
  },
  atualizar(id, dados) {
    return requisicao(`${endpoint}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(dados) })
  },
  excluir(id) {
    return requisicao(`${endpoint}/${encodeURIComponent(id)}`, { method: 'DELETE' })
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
