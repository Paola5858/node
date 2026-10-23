import { apiFetch } from './sessionToken'

const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const tipos = new Set(['safra', 'unidade', 'equipamento', 'medicao', 'unidademedida', 'tipoinformacao'])

async function request(tipo, id, options = {}) {
  if (!tipos.has(tipo)) throw new Error('tipo de cadastro inválido.')
  const sufixo = id === undefined ? '' : `/${encodeURIComponent(id)}`
  const response = await apiFetch(`${apiBase}/cadastros/${tipo}${sufixo}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  if (response.status === 204) return null
  const text = await response.text()
  let data = null
  if (text.trim()) {
    try { data = JSON.parse(text) } catch { throw new Error('a API de cadastros respondeu um conteúdo inválido.') }
  }
  if (!response.ok) throw new Error(data?.message || `erro HTTP ${response.status}`)
  return data
}

export const cadastroService = {
  listar: (tipo) => request(tipo),
  criar: (tipo, registro) => request(tipo, undefined, { method: 'POST', body: JSON.stringify(registro) }),
  atualizar: (tipo, id, registro) => request(tipo, id, { method: 'PUT', body: JSON.stringify(registro) }),
  excluir: (tipo, id) => request(tipo, id, { method: 'DELETE' }),
}
