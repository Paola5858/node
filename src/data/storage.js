// Credenciais e sessões não são armazenadas pelo frontend. A autenticação deve
// ser mantida e validada pelo servidor por meio de cookie HttpOnly.
export function removerSenhaLocalLegada() {
  try {
    const chave = 'plume.usuario'
    const texto = window.localStorage.getItem(chave)
    if (!texto) return
    const usuario = JSON.parse(texto)
    if (!usuario || typeof usuario !== 'object' || !Object.hasOwn(usuario, 'senha')) return
    delete usuario.senha
    window.localStorage.setItem(chave, JSON.stringify(usuario))
  } catch {
    // Mantém um registro malformado intacto para não apagar dados sem conseguir inspecioná-lo.
  }
}
