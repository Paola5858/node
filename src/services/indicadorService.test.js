import { afterEach, describe, expect, it, vi } from 'vitest'
import { indicadorService, normalizarIndicador } from './indicadorService'

afterEach(() => vi.restoreAllMocks())

describe('indicadorService', () => {
  it('lista indicadores e normaliza formatos de resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 7, nome: 'Produção', descricao: 'Painel', url: 'https://app.powerbi.com/view?r=x' }]), { status: 200 })))
    const resultado = await indicadorService.listar()
    expect(resultado).toHaveLength(1)
    expect(normalizarIndicador(resultado[0])).toEqual({ Id: 7, Nome: 'Produção', Descricao: 'Painel', Url: 'https://app.powerbi.com/view?r=x' })
    expect(fetch).toHaveBeenCalledWith('/api/indicador', expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }))
  })

  it('consulta, cadastra e atualiza com método e payload corretos', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ Id: 1, Nome: 'A', Descricao: 'B', Url: 'https://pbi.com' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Id: 2, Nome: 'C', Descricao: 'D', Url: 'https://pbi.com' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Id: 2, Nome: 'E', Descricao: 'D', Url: 'https://pbi.com' }), { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)

    await indicadorService.consultar(1)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/indicador/1', expect.anything())

    await indicadorService.cadastrar({ Nome: 'C', Descricao: 'D', Url: 'https://pbi.com' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/indicador', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ Nome: 'C', Descricao: 'D', Url: 'https://pbi.com' })
    }))

    await indicadorService.atualizar(2, { Nome: 'E', Descricao: 'D', Url: 'https://pbi.com' })
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/indicador/2', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ Nome: 'E', Descricao: 'D', Url: 'https://pbi.com' })
    }))
  })

  it('aceita resposta 204 sem tentar fazer parse de JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(indicadorService.excluir(3)).resolves.toBeNull()
  })

  it('explica resposta que não é JSON com status 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 200 })))
    await expect(indicadorService.listar()).rejects.toThrow('conteúdo inválido')
  })

  it('extrai mensagem de erro da API quando resposta é erro HTTP com JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ erro: 'Id inválido' }), { status: 400 })))
    await expect(indicadorService.consultar('abc')).rejects.toThrow('Id inválido')
  })

  it('apresenta erro HTTP quando o backend responde 404 sem corpo JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Cannot GET /api/indicador', { status: 404 })))
    await expect(indicadorService.listar()).rejects.toThrow('erro HTTP 404')
  })

  it('traduz falha de rede para uma mensagem útil', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')))
    await expect(indicadorService.listar()).rejects.toThrow('não foi possível conectar à API')
  })

  it('traduz timeout da requisição (AbortError) para mensagem clara', async () => {
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr))
    await expect(indicadorService.listar()).rejects.toThrow('a API não respondeu em 10 s')
  })
})
