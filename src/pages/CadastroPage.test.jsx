import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import CadastroPage from './CadastroPage'

describe('CadastroPage', () => {
  it('mostra os campos obrigatorios ao tentar salvar vazio', async () => {
    const user = userEvent.setup()
    render(<CadastroPage tipo="safra" onNavigate={() => {}} />)

    await user.click(screen.getByRole('button', { name: /cadastrar registro/i }))

    expect(screen.getByText('informe nome da safra')).toBeInTheDocument()
    expect(screen.getByText('informe data inicial')).toBeInTheDocument()
    expect(screen.getByText('informe data final')).toBeInTheDocument()
    expect(screen.getByText('selecione ou capture uma imagem')).toBeInTheDocument()
  })

  it('rejeita uma data final anterior a data inicial', async () => {
    const user = userEvent.setup()
    render(<CadastroPage tipo="safra" onNavigate={() => {}} />)

    await user.type(screen.getByLabelText(/nome da safra/i), 'Safra 2026')
    await user.type(screen.getByLabelText(/data inicial/i), '2026-08-20')
    await user.type(screen.getByLabelText(/data final/i), '2026-08-19')
    await user.click(screen.getByRole('button', { name: /cadastrar registro/i }))

    expect(screen.getByText('a data final deve ser depois da inicial')).toBeInTheDocument()
  })

  it('não anuncia sucesso quando não existe API de persistência', async () => {
    const user = userEvent.setup()
    render(<CadastroPage tipo="safra" onNavigate={() => {}} />)

    await user.type(screen.getByLabelText(/nome da safra/i), 'Safra 2026')
    await user.type(screen.getByLabelText(/data inicial/i), '2026-08-20')
    await user.type(screen.getByLabelText(/data final/i), '2026-09-20')
    await user.upload(screen.getByLabelText(/imagem da safra/i), new File(['imagem'], 'safra.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: /cadastrar registro/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('registro não salvo: a API de persistência para safra não está disponível')
  })
})
