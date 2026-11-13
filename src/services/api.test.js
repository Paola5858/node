import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  cadastroApi,
  criarLoteImportacao,
  gerarPreviaImportacao,
  confirmarImportacao,
  listaDaResposta,
  preservarArquivoOriginal,
} from './api'

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

  it('envia os bytes originais do CSV ao endpoint protegido de importação', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 12 }), { status: 201 })))
    const file = {
      name: 'origem.csv',
      size: 3,
      arrayBuffer: async () => Uint8Array.from([65, 66, 67]).buffer,
    }

    await expect(preservarArquivoOriginal(file)).resolves.toEqual({ id: 12 })
    expect(fetch).toHaveBeenCalledWith('/api/imports', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ fileName: 'origem.csv', contentType: 'text/csv', base64: 'QUJD' }),
    }))
  })

  it('inclui a usina e a frente selecionadas no lote de importação', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 13 }), { status: 201 })))
    const file = {
      name: 'origem.csv',
      size: 3,
      arrayBuffer: async () => Uint8Array.from([65, 66, 67]).buffer,
    }

    await preservarArquivoOriginal(file, { unitId: 12, frontId: 4 })
    expect(fetch).toHaveBeenCalledWith('/api/imports', expect.objectContaining({
      body: JSON.stringify({
        fileName: 'origem.csv',
        contentType: 'text/csv',
        base64: 'QUJD',
        unitId: 12,
        frontId: 4,
      }),
    }))
  })

  it('envia usina, safra e fonte e preserva o conflito de hash para reprocessamento explícito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: 'arquivo já importado',
      existingBatchId: 7,
      canReprocess: true,
    }), { status: 409 })))
    const file = {
      name: 'origem.csv',
      size: 3,
      arrayBuffer: async () => Uint8Array.from([65, 66, 67]).buffer,
    }

    await expect(criarLoteImportacao(file, {
      unitId: 12,
      harvestId: 14,
      entityType: 'loads',
      sourceName: 'LIMS',
      reprocessOf: 7,
    })).rejects.toMatchObject({
      status: 409,
      data: { existingBatchId: 7, canReprocess: true },
    })
    expect(fetch).toHaveBeenCalledWith('/api/imports', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        fileName: 'origem.csv',
        contentType: 'text/csv',
        base64: 'QUJD',
        unitId: 12,
        harvestId: 14,
        entityType: 'loads',
        sourceName: 'LIMS',
        reprocessOf: 7,
      }),
    }))
  })

  it('submits the preview mapping only after an explicit confirmation action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response(JSON.stringify({ id: 8, status: 'queued' }), { status: 202 })))
    const mapping = { measured_at: 'DATA', equipment: 'EQ', indicator: 'IND', value: 'VAL', unit_of_measure: 'UOM' }

    await gerarPreviaImportacao(8, 'Medições')
    expect(fetch).toHaveBeenLastCalledWith('/api/imports/8/preview', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sheetName: 'Medições' }),
    }))
    await confirmarImportacao(8, { mapping, templateName: 'LIMS diário' })
    expect(fetch).toHaveBeenLastCalledWith('/api/imports/8/confirm', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ mapping, templateName: 'LIMS diário' }),
    }))
  })
})
