import { useState } from 'react'

const cadastros = [
  ['safra', 'safra', '01'],
  ['unidade', 'unidade', '02'],
  ['equipamento', 'equipamento', '03'],
  ['medicao', 'medição', '04'],
  ['unidademedida', 'unidade de medida', '05'],
  ['tipoinformacao', 'tipo de informação', '06'],
  ['indicadores', 'indicadores', '07'],
]

function MenuLateral({ aberto, telaAtual, setTela }) {
  const [cadastroAberto, setCadastroAberto] = useState(true)

  return (
    <aside
      className={`menu-lateral ${aberto ? "aberto" : "fechado"}`}
      aria-label="Menu principal"
    >
      <div className="sidebar-brand">
        <span className="brand-mark">p</span>
        <div>
          <strong>
            plum<span>e</span>
          </strong>
          <small>admin workspace</small>
        </div>
      </div>
      <div className="sidebar-label">espaço de trabalho</div>
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${telaAtual === "inicio" ? "ativo" : ""}`}
          type="button"
          onClick={() => setTela("inicio")}
        >
          <span className="nav-glyph">⌂</span>
          <span>início</span>
          <span className="nav-arrow">›</span>
        </button>
        <button
          className={`nav-item ${telaAtual !== "inicio" ? "ativo" : ""}`}
          type="button"
          onClick={() => setCadastroAberto((aberto) => !aberto)}
          aria-expanded={cadastroAberto}
        >
          <span className="nav-glyph">＋</span>
          <span>operação</span>
          <span className={`chevron ${cadastroAberto ? "rotated" : ""}`}>
            ⌄
          </span>
        </button>
        <div className={`submenu ${cadastroAberto ? "visivel" : ""}`}>
          {cadastros.map(([id, nome, numero]) => (
            <button
              className={`submenu-item ${telaAtual === id ? "selecionado" : ""}`}
              type="button"
              key={id}
              onClick={() => setTela(id)}
            >
              <span className="submenu-number">{numero}</span>
              <span>{nome}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-section-label">inteligência</div>
        <button
          className="nav-item nav-item-muted"
          type="button"
          onClick={() => setTela("indicadores")}
        >
          <span className="nav-glyph">◌</span>
          <span>indicadores</span>
          <span className="nav-count">07</span>
        </button>
        <button
          className="nav-item nav-item-muted"
          type="button"
          onClick={() => setTela("medicao")}
        >
          <span className="nav-glyph">⌁</span>
          <span>medições</span>
          <span className="nav-arrow">›</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="profile-card">
          <span className="avatar">ps</span>
          <div>
            <strong>paola soares</strong>
            <small>designer of ideas</small>
          </div>
          <span className="more">•••</span>
        </div>
        <p className="sidebar-note">dados para decidir com clareza.</p>
      </div>
    </aside>
  );
}

export default MenuLateral
