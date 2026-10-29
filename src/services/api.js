import { apiFetch } from './sessionToken'

const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export const ROTAS = {
  safra: '/cadastros/safra',
  unidade: '/cadastros/unidade',
  unidademedida: '/cadastros/unidademedida',
  equipamento: '/cadastros/equipamento',
  tipoinformacao: '/cadastros/tipoinformacao',
  medicao: '/cadastros/medicao',
}

async function requisicao(url, opcoes = {}) {
  let resposta
  try {
    resposta = await apiFetch(url, {
      ...opcoes,
      headers: {
        Accept: 'application/json',
        ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
        ...opcoes.headers,
      },
    })
  } catch {
    throw new Error('não foi possível conectar à API. verifique se o servidor do Plume está ativo.')
  }

  if (resposta.status === 204) return null
  const texto = await resposta.text()
  let dados = null
  if (texto.trim()) {
    try { dados = JSON.parse(texto) } catch { throw new Error('a API respondeu um conteúdo inválido.') }
  }
  if (!resposta.ok) throw new Error(dados?.message || dados?.erro || `erro HTTP ${resposta.status}`)
  return dados
}

export function listaDaResposta(dados) {
  if (Array.isArray(dados)) return dados
  if (Array.isArray(dados?.data)) return dados.data
  if (Array.isArray(dados?.items)) return dados.items
  throw new Error('a API deve retornar uma lista JSON de registros.')
}

export async function api(recurso, metodo = 'GET', dados = null, id = null) {
  const rota = ROTAS[recurso]
  if (!rota) throw new Error(`recurso de cadastro inválido: ${recurso}`)
  const sufixo = id === null || id === undefined ? '' : `/${encodeURIComponent(id)}`
  return requisicao(`${apiBase}${rota}${sufixo}`, {
    method: metodo,
    ...(dados === null ? {} : { body: JSON.stringify(dados) }),
  })
}

export const cadastroApi = {
  listar: (recurso) => api(recurso),
  consultar: (recurso, id) => api(recurso, 'GET', null, id),
  criar: (recurso, dados) => api(recurso, 'POST', dados),
  atualizar: (recurso, id, dados) => api(recurso, 'PUT', dados, id),
  excluir: (recurso, id) => api(recurso, 'DELETE', null, id),
}

export const apiConfig = { base: apiBase, rotas: ROTAS }
