import React, { useRef, useState } from "react";
import ContextSelector from "../components/common/ContextSelector";
import { authService } from "../services/authService";

function Header({ safraAtual, safras, onChangeSafra, sessao, onLogout }) {
  const inputFoto = useRef(null)
  const [avisoFoto, setAvisoFoto] = useState('')
  const [salvandoFoto, setSalvandoFoto] = useState(false)

  async function selecionarFoto(event) {
    const arquivo = event.target.files?.[0]
    event.target.value = ''
    if (!arquivo) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type) || arquivo.size > 8 * 1024 * 1024) {
      setAvisoFoto('use uma imagem PNG, JPEG ou WebP de até 8 MB.')
      return
    }
    setSalvandoFoto(true)
    try {
      const foto = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('não foi possível ler a imagem.'))
        reader.readAsDataURL(arquivo)
      })
      const resultado = await authService.atualizarPerfil({ nome: sessao.nome || sessao.name || sessao.email, foto })
      window.dispatchEvent(new CustomEvent('plume:profile-updated', { detail: resultado.user }))
      setAvisoFoto('foto de perfil salva na sua conta.')
    } catch (error) { setAvisoFoto(error.message) } finally { setSalvandoFoto(false) }
  }

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="header-kicker">plume / 2026</span>
        <span className="header-divider" />
        <span className="header-title">inteligência agrícola</span>
      </div>
      <div className="header-right">
        <ContextSelector
          safraAtual={safraAtual}
          safras={safras}
          onChange={onChangeSafra}
        />
        {sessao ? (
          <>
          <span className="header-session">{sessao.nome || sessao.name || sessao.email}</span>
            <button className="header-profile-button" type="button" onClick={() => inputFoto.current?.click()} disabled={salvandoFoto} aria-label="Alterar foto de perfil" title="Alterar foto de perfil">
              {sessao.foto ? <img className="header-avatar" src={sessao.foto} alt="Foto de perfil" /> : <span className="header-avatar">{String(sessao.nome || sessao.name || sessao.email || 'u').slice(0, 2).toLowerCase()}</span>}
            </button>
            <input ref={inputFoto} className="profile-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={selecionarFoto} aria-label="Escolher foto de perfil" />
            <button className="header-logout" type="button" onClick={onLogout}>sair</button>
            {avisoFoto && <span className="profile-feedback" role="status">{avisoFoto}</span>}
          </>
        ) : (
          <span className="header-login">sessão não iniciada</span>
        )}
      </div>
    </header>
  );
}

export default Header;
