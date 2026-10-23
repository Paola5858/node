import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import VisualizarIndicador from './VisualizarIndicador'

const primeiro = { Id: 1, Nome: 'Produção', Descricao: 'Painel A', Url: 'https://app.powerbi.com/report-a' }

describe('VisualizarIndicador', () => {
  it('reinicia o estado do documento ao trocar a identidade e a URL do indicador', () => {
    const { rerender } = render(<VisualizarIndicador indicador={primeiro} />)
    fireEvent.load(screen.getByTitle('Painel Produção'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    rerender(<VisualizarIndicador indicador={{ ...primeiro, Id: 2, Nome: 'Eficiência', Url: 'https://app.powerbi.com/report-b' }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/aguardando o documento/i)
    expect(screen.getByTitle('Painel Eficiência')).toHaveAttribute('src', 'https://app.powerbi.com/report-b')
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
