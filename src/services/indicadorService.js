const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const endpoint = `${apiBase}/indicador`

async function requisicao(url, opcoes = {}) {
  let resposta
  try {
    resposta = await fetch(url, {
      ...opcoes,
      headers: {
        Accept: 'application/json',
        ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
        ...opcoes.headers,
      },
    })
  } catch {
    throw new Error('não foi possível conectar à API de indicadores. verifique se o Node-RED está ativo.')
  }

  const texto = await resposta.text()
  let dados = null
  if (texto) {
    try {
      dados = JSON.parse(texto)
    } catch {
      throw new Error('a API respondeu um conteúdo inválido. confira a rota /api/indicador.')
    }
  }

  if (!resposta.ok) {
    const mensagem = dados?.message || dados?.erro || dados?.error
    throw new Error(mensagem || `erro HTTP ${resposta.status}`)
  }
  return dados
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
