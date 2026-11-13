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
  if (!resposta.ok) {
    const failure = new Error(dados?.message || dados?.erro || `erro HTTP ${resposta.status}`)
    failure.status = resposta.status
    failure.data = dados
    throw failure
  }
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

export async function preservarArquivoOriginal(file, { unitId, frontId } = {}) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  const contentType = {
    '.csv': 'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[extension]
  if (!contentType) throw new Error('selecione um arquivo CSV ou XLSX.')
  if (file.size > 9 * 1024 * 1024) throw new Error('o arquivo ultrapassa o limite permitido de 9 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return requisicao(`${apiBase}/imports`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      base64: btoa(binary),
      ...(unitId === undefined ? {} : { unitId }),
      ...(frontId === undefined ? {} : { frontId }),
    }),
  })
}

export async function criarLoteImportacao(file, { unitId, harvestId, entityType = 'measurements', sourceName, frontId, reprocessOf } = {}) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  const contentType = {
    '.csv': 'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[extension]
  if (!contentType) throw new Error('selecione um arquivo CSV ou XLSX.')
  if (file.size > 9 * 1024 * 1024) throw new Error('o arquivo ultrapassa o limite permitido de 9 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return requisicao(`${apiBase}/imports`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      base64: btoa(binary),
      unitId,
      harvestId,
      entityType,
      sourceName,
      ...(frontId === undefined ? {} : { frontId }),
      ...(reprocessOf === undefined ? {} : { reprocessOf }),
    }),
  })
}

export async function obterOpcoesImportacao() {
  return requisicao(`${apiBase}/imports/options`)
}

export async function gerarPreviaImportacao(id, sheetName = '') {
  return requisicao(`${apiBase}/imports/${encodeURIComponent(id)}/preview`, {
    method: 'POST',
    body: JSON.stringify({ sheetName }),
  })
}

export async function confirmarImportacao(id, { mapping, templateName = '' }) {
  return requisicao(`${apiBase}/imports/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ mapping, templateName }),
  })
}

export async function consultarImportacao(id) {
  return requisicao(`${apiBase}/imports/${encodeURIComponent(id)}`)
}

export async function listarQualidadeImportacao() {
  return requisicao(`${apiBase}/imports/quality`)
}

export async function consultarLinhasImportacao(id, queue) {
  const query = new URLSearchParams({ queue, limit: '100' })
  return requisicao(`${apiBase}/imports/${encodeURIComponent(id)}/rows?${query}`)
}

export async function baixarRelatorioImportacao(id) {
  const response = await apiFetch(`${apiBase}/imports/${encodeURIComponent(id)}/report.csv`, {
    headers: { Accept: 'text/csv' },
  })
  if (!response.ok) {
    let message = `erro HTTP ${response.status}`
    try { message = (await response.json()).message || message } catch { /* resposta pode estar vazia */ }
    throw new Error(message)
  }
  return response.blob()
}

export const cadastroApi = {
  listar: (recurso) => api(recurso),
  consultar: (recurso, id) => api(recurso, 'GET', null, id),
  criar: (recurso, dados) => api(recurso, 'POST', dados),
  atualizar: (recurso, id, dados) => api(recurso, 'PUT', dados, id),
  excluir: (recurso, id) => api(recurso, 'DELETE', null, id),
}

export const apiConfig = { base: apiBase, rotas: ROTAS }
