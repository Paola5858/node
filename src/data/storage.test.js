import { describe, expect, it } from 'vitest'
import { removerSenhaLocalLegada } from './storage'

describe('storage de conta legada', () => {
  it('remove senha em texto puro e preserva os outros dados do perfil', () => {
    const legado = { nome: 'Paola', email: 'paola@example.com', senha: 'nao-guardar', foto: 'data:image/png;base64,abc' }
    window.localStorage.setItem('plume.usuario', JSON.stringify(legado))

    removerSenhaLocalLegada()

    expect(JSON.parse(window.localStorage.getItem('plume.usuario'))).toEqual({ nome: 'Paola', email: 'paola@example.com', foto: 'data:image/png;base64,abc' })
  })
})
