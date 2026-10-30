import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import VisualizarIndicador from './VisualizarIndicador'

const primeiro = { Id: 1, Nome: 'Produção', Descricao: 'Painel A', Url: 'https://app.powerbi.com/reportEmbed?reportId=22450b7a-e0c7-4472-a33a-becc7adaa99e&ctid=b1051c4b-3b94-41ab-9441-e73a72342fdd' }
const linkPublico = 'https://app.powerbi.com/view?r=eyJrIjoiYzBjZTIzNDQtNjcxNi00NmEwLTg1NzQtMDQ3YWE3M2ZkZDEwIiwidCI6ImIxMDUxYzRiLTNiOTQtNDFhYi05NDQxLWU3M2E3MjM0MmZkZCJ9'

describe('VisualizarIndicador', () => {
  it('incorpora links públicos do Power BI', () => {
    render(<VisualizarIndicador indicador={{ ...primeiro, Url: linkPublico }} />)

    expect(screen.getByTitle('Painel Produção')).toHaveAttribute('src', linkPublico)
  })

  it('reinicia o estado do documento ao trocar a identidade e a URL do indicador', () => {
    const { rerender } = render(<VisualizarIndicador indicador={primeiro} />)
    fireEvent.load(screen.getByTitle('Painel Produção'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    const proximaUrl = 'https://app.powerbi.com/reportEmbed?reportId=11111111-1111-4111-8111-111111111111&ctid=b1051c4b-3b94-41ab-9441-e73a72342fdd'
    rerender(<VisualizarIndicador indicador={{ ...primeiro, Id: 2, Nome: 'Eficiência', Url: proximaUrl }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/aguardando o documento/i)
    expect(screen.getByTitle('Painel Eficiência')).toHaveAttribute('src', proximaUrl)
  })

  it('não trata onLoad como confirmação de disponibilidade do relatório e oferece abertura externa', () => {
    render(<VisualizarIndicador indicador={primeiro} />)
    fireEvent.load(screen.getByTitle('Painel Produção'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(/não confirma que o relatório está disponível/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /abrir em nova aba/i })).toHaveAttribute('href', primeiro.Url)
  })

  it('mostra erro claro e não cria iframe para URL inválida', () => {
    render(<VisualizarIndicador indicador={{ ...primeiro, Url: 'javascript:alert(1)' }} />)
    expect(screen.getByText(/url de painel inválida/i)).toBeInTheDocument()
    expect(screen.queryByTitle('Painel Produção')).not.toBeInTheDocument()
  })
})
