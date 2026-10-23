import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { authService } from './services/authService'
import { indicadorService } from './services/indicadorService'

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('App session gate', () => {
  it('does not load indicator data or reveal internal pages without a server session', async () => {
    vi.spyOn(authService, 'sessao').mockResolvedValue(null)
    const listar = vi.spyOn(indicadorService, 'listar').mockResolvedValue([])

    render(<App />)

    await waitFor(() => expect(screen.getByRole('heading', { name: /volte para a operação/i })).toBeInTheDocument())
    expect(listar).not.toHaveBeenCalled()
    expect(screen.queryByText(/dados insuficientes para avaliação/i)).not.toBeInTheDocument()
  })
})
