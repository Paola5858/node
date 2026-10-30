import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IndicadoresPage from './IndicadoresPage'
import { indicadorService } from '../services/indicadorService'

const mockIndicadores = [
  {
    Id: 1,
    Nome: 'Produção Diária',
    Descricao: 'Painel de colheita',
    Url: 'https://app.powerbi.com/reportEmbed?reportId=22450b7a-e0c7-4472-a33a-becc7adaa99e&ctid=b1051c4b-3b94-41ab-9441-e73a72342fdd',
  },
  {
    Id: 2,
    Nome: 'Eficiência Energética',
    Descricao: 'Consumo por hectare',
    Url: 'https://app.powerbi.com/reportEmbed?reportId=22450b7a-e0c7-4472-a33a-becc7adaa99e&ctid=b1051c4b-3b94-41ab-9441-e73a72342fdd',
  },
]

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('IndicadoresPage', () => {
  it('carrega e lista os indicadores da API', async () => {
    vi.spyOn(indicadorService, 'listar').mockResolvedValue(mockIndicadores)

    render(<IndicadoresPage />)

    expect(screen.getByText(/consultando sua api/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Produção Diária')).toBeInTheDocument()
      expect(screen.getByText('Eficiência Energética')).toBeInTheDocument()
    })

    expect(screen.getByText('2 indicadores')).toBeInTheDocument()
  })

  it('permite filtrar indicadores pela busca por nome', async () => {
    const user = userEvent.setup()
    vi.spyOn(indicadorService, 'listar').mockResolvedValue(mockIndicadores)

    render(<IndicadoresPage />)

    await waitFor(() => {
      expect(screen.getByText('Produção Diária')).toBeInTheDocument()
    })

    const inputBusca = screen.getByLabelText(/buscar indicador/i)
    await user.type(inputBusca, 'eficiencia')

    expect(screen.queryByText('Produção Diária')).not.toBeInTheDocument()
    expect(screen.getByText('Eficiência Energética')).toBeInTheDocument()
  })

  it('valida campos obrigatórios e formato de URL no cadastro', async () => {
    const user = userEvent.setup()
    vi.spyOn(indicadorService, 'listar').mockResolvedValue([])

    render(<IndicadoresPage />)

    await waitFor(() => {
      expect(screen.getByText(/seu catálogo ainda está vazio/i)).toBeInTheDocument()
    })

    const btnSubmit = screen.getByRole('button', { name: /cadastrar indicador/i })
    await user.click(btnSubmit)

    expect(screen.getByText('informe o nome do indicador')).toBeInTheDocument()
    expect(screen.getByText('explique o que este indicador representa')).toBeInTheDocument()
    expect(screen.getByText('informe a URL do painel')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^nome/i), 'Novo')
    await user.type(screen.getByLabelText(/^descrição/i), 'Descrição')
    await user.type(screen.getByLabelText(/url do painel/i), 'ftp://invalido')
    await user.click(btnSubmit)

    expect(screen.getByText('use um link público (/view?r=...) ou reportEmbed válido do Power BI')).toBeInTheDocument()
  })

  it('cadastra novo indicador com sucesso e atualiza a lista', async () => {
    const user = userEvent.setup()
    const publicReportUrl = 'https://app.powerbi.com/view?r=eyJrIjoiYzBjZTIzNDQtNjcxNi00NmEwLTg1NzQtMDQ3YWE3M2ZkZDEwIiwidCI6ImIxMDUxYzRiLTNiOTQtNDFhYi05NDQxLWU3M2E3MjM0MmZkZCJ9'
    const listarMock = vi.spyOn(indicadorService, 'listar')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ Id: 10, Nome: 'Qualidade do Solo', Descricao: 'Medições de pH', Url: publicReportUrl }])

    const cadastrarMock = vi.spyOn(indicadorService, 'cadastrar').mockResolvedValue({
      Id: 10,
      Nome: 'Qualidade do Solo',
      Descricao: 'Medições de pH',
      Url: publicReportUrl,
    })

    const onItemsChange = vi.fn()

    render(<IndicadoresPage onItemsChange={onItemsChange} />)

    await waitFor(() => {
      expect(screen.getByText(/seu catálogo ainda está vazio/i)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/^nome/i), 'Qualidade do Solo')
    await user.type(screen.getByLabelText(/^descrição/i), 'Medições de pH')
    await user.type(screen.getByLabelText(/url do painel/i), publicReportUrl)

    await user.click(screen.getByRole('button', { name: /cadastrar indicador/i }))

    await waitFor(() => {
      expect(cadastrarMock).toHaveBeenCalledWith({
        Nome: 'Qualidade do Solo',
        Descricao: 'Medições de pH',
        Url: publicReportUrl,
      })
      expect(screen.getByRole('status')).toHaveTextContent(/indicador criado e menu atualizado/i)
      expect(screen.getByText('Qualidade do Solo')).toBeInTheDocument()
    })

    expect(listarMock).toHaveBeenCalledTimes(2)
    expect(onItemsChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ Id: 10, Nome: 'Qualidade do Solo' })
    ]))
  })

  it('permite editar um indicador existente', async () => {
    const user = userEvent.setup()
    vi.spyOn(indicadorService, 'listar')
      .mockResolvedValueOnce(mockIndicadores)
      .mockResolvedValueOnce([
        { ...mockIndicadores[0], Nome: 'Produção Diária v2' },
        mockIndicadores[1],
      ])

    const atualizarMock = vi.spyOn(indicadorService, 'atualizar').mockResolvedValue({
      ...mockIndicadores[0],
      Nome: 'Produção Diária v2',
    })

    render(<IndicadoresPage />)

    await waitFor(() => {
      expect(screen.getByText('Produção Diária')).toBeInTheDocument()
    })

    const botoesEditar = screen.getAllByRole('button', { name: /editar/i })
    await user.click(botoesEditar[0])

    expect(screen.getByDisplayValue('Produção Diária')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar alterações/i })).toBeInTheDocument()

    const inputNome = screen.getByLabelText(/^nome/i)
    await user.clear(inputNome)
    await user.type(inputNome, 'Produção Diária v2')

    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await waitFor(() => {
      expect(atualizarMock).toHaveBeenCalledWith(1, expect.objectContaining({
        Nome: 'Produção Diária v2',
      }))
      expect(screen.getByRole('status')).toHaveTextContent(/indicador atualizado com sucesso/i)
    })
  })

  it('exclui um indicador após confirmação', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(indicadorService, 'listar')
      .mockResolvedValueOnce(mockIndicadores)
      .mockResolvedValueOnce([mockIndicadores[1]])

    const excluirMock = vi.spyOn(indicadorService, 'excluir').mockResolvedValue(null)

    render(<IndicadoresPage />)

    await waitFor(() => {
      expect(screen.getByText('Produção Diária')).toBeInTheDocument()
    })

    const botoesExcluir = screen.getAllByRole('button', { name: /excluir/i })
    await user.click(botoesExcluir[0])

    await waitFor(() => {
      expect(excluirMock).toHaveBeenCalledWith(1)
      expect(screen.getByText('indicador removido.')).toBeInTheDocument()
    })
  })

  it('exibe estado de erro e permite tentar novamente', async () => {
    const user = userEvent.setup()
    const listarMock = vi.spyOn(indicadorService, 'listar')
      .mockRejectedValueOnce(new Error('não foi possível conectar à API de indicadores'))
      .mockResolvedValueOnce(mockIndicadores)

    render(<IndicadoresPage />)

    await waitFor(() => {
      expect(screen.getByText(/não consegui falar com a api/i)).toBeInTheDocument()
      expect(screen.getByText(/não foi possível conectar à API de indicadores/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }))

    await waitFor(() => {
      expect(screen.getByText('Produção Diária')).toBeInTheDocument()
    })

    expect(listarMock).toHaveBeenCalledTimes(2)
  })

  it('seleciona indicador, exibe painel e fecha ao clicar em voltar para a lista', async () => {
    const user = userEvent.setup()
    vi.spyOn(indicadorService, 'listar').mockResolvedValue(mockIndicadores)
    const onSelect = vi.fn()

    render(<IndicadoresPage onSelect={onSelect} />)

    await waitFor(() => {
      expect(screen.getByText('Produção Diária')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Produção Diária'))

    expect(onSelect).toHaveBeenCalledWith(mockIndicadores[0])
    expect(screen.getByText(/painel selecionado/i)).toBeInTheDocument()
    expect(screen.getByTitle('Painel Produção Diária')).toBeInTheDocument()

    const btnVoltar = screen.getByRole('button', { name: /voltar para a lista/i })
    await user.click(btnVoltar)

    expect(screen.queryByTitle('Painel Produção Diária')).not.toBeInTheDocument()
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('aplica o indicador solicitado pelo menu quando a primeira resposta ainda estava pendente', async () => {
    let responder
    const listarMock = vi.spyOn(indicadorService, 'listar').mockImplementation(() => new Promise((resolve) => { responder = resolve }))
    const onSelect = vi.fn()
    function Harness() {
      const [id, setId] = React.useState(null)
      return <><button onClick={() => setId(1)}>abrir indicador do menu</button><IndicadoresPage initialSelectedId={id} onSelect={onSelect} /></>
    }

    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /abrir indicador do menu/i }))
    expect(listarMock).toHaveBeenCalledTimes(1)
    responder(mockIndicadores)

    await waitFor(() => {
      expect(screen.getByTitle('Painel Produção Diária')).toBeInTheDocument()
      expect(onSelect).toHaveBeenCalledWith(mockIndicadores[0])
    })
  })

  it('limpa seleção externa cujo indicador não está na resposta da API', async () => {
    vi.spyOn(indicadorService, 'listar').mockResolvedValue(mockIndicadores)
    const onSelect = vi.fn()
    render(<IndicadoresPage initialSelectedId="missing" onSelect={onSelect} />)

    await waitFor(() => expect(screen.getByText('Produção Diária')).toBeInTheDocument())
    expect(screen.queryByText(/painel selecionado/i)).not.toBeInTheDocument()
  })
})
