import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, cadastroApi, listaDaResposta } from './api'

afterEach(() => vi.restoreAllMocks())

describe('cliente REST dos cadastros', () => {
  it('monta a rota do recurso e envia JSON no POST', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ Id: 4 }), { status: 201 })))
    await expect(cadastroApi.criar('unidade', { nome: 'Usina' })).resolves.toEqual({ Id: 4 })
    expect(fetch).toHaveBeenCalledWith('/api/cadastros/unidade', expect.objectContaining({ method: 'POST', body: JSON.stringify({ nome: 'Usina' }) }))
  })

  it('aceita listas diretas e respostas paginadas', () => {
    expect(listaDaResposta([{ Id: 1 }])).toEqual([{ Id: 1 }])
    expect(listaDaResposta({ data: [{ Id: 2 }] })).toEqual([{ Id: 2 }])
    expect(listaDaResposta({ items: [{ Id: 3 }] })).toEqual([{ Id: 3 }])
  })

  it('trata 204 em exclusões e rejeita recurso desconhecido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(cadastroApi.excluir('unidade', 8)).resolves.toBeNull()
    await expect(api('nao-existe')).rejects.toThrow('recurso de cadastro inválido')
  })

  it('exibe a mensagem devolvida pelo servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'registro associado' }), { status: 409 })))
    await expect(cadastroApi.excluir('unidade', 8)).rejects.toThrow('registro associado')
  })
})
