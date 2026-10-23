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

  it('aceita resposta 204 sem tentar fazer parse de JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(indicadorService.excluir(3)).resolves.toBeNull()
  })

  it('explica resposta que não é JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 200 })))
    await expect(indicadorService.listar()).rejects.toThrow('conteúdo inválido')
  })

  it('traduz falha de rede para uma mensagem útil', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')))
    await expect(indicadorService.listar()).rejects.toThrow('não foi possível conectar à API')
  })
})
