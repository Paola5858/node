import { apiFetch, guardarCsrfToken } from './sessionToken'

const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

async function requisicaoAuth(caminho, opcoes = {}) {
  const resposta = await apiFetch(`${apiBase}${caminho}`, {
    ...opcoes,
    headers: {
      Accept: 'application/json',
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
      ...opcoes.headers,
    },
  })
  if (resposta.status === 204) return null
  const texto = await resposta.text()
  let dados = null
  if (texto.trim()) {
    try { dados = JSON.parse(texto) } catch { throw new Error('o serviço de autenticação respondeu um conteúdo inválido.') }
  }
  if (!resposta.ok) {
    if (resposta.status === 404 || resposta.status === 405) {
      throw new Error('autenticação do servidor indisponível: configure a API de sessão antes de liberar o acesso.')
    }
    throw new Error(dados?.message || dados?.erro || 'não foi possível validar a sessão com o servidor.')
  }
  if (Object.hasOwn(dados || {}, 'csrfToken')) guardarCsrfToken(dados.csrfToken)
  return dados
}

export const authService = {
  async sessao() {
    const dados = await requisicaoAuth('/auth/session')
    return dados?.user || null
  },
  async entrar(email, senha) {
    const dados = await requisicaoAuth('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) })
    const sessao = await requisicaoAuth('/auth/session')
    return sessao?.user || dados?.user || null
  },
  cadastrar(usuario) {
    return requisicaoAuth('/auth/register', { method: 'POST', body: JSON.stringify(usuario) })
  },
  sair() {
    return requisicaoAuth('/auth/logout', { method: 'POST' })
  },
  atualizarPerfil(perfil) {
    return requisicaoAuth('/auth/profile', { method: 'PATCH', body: JSON.stringify(perfil) })
  },
}
