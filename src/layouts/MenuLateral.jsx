const grupos = [
  {
    titulo: "operação",
    itens: [
      ["safra", "safras"],
      ["unidade", "unidades"],
      ["equipamento", "equipamentos"],
    ],
  },
  {
    titulo: "monitoramento",
    itens: [
      ["medicao", "medições"],
      ["mapa", "mapa"],
    ],
  },
  {
    titulo: "inteligência",
    itens: [
      ["indicadores", "indicadores"],
      ["alertas", "alertas"],
      ["relatorios", "relatórios"],
    ],
  },
  {
    titulo: "configuração",
    itens: [
      ["tipoinformacao", "tipos de informação"],
      ["unidademedida", "unidades de medida"],
    ],
  },
];

function MenuLateral({ aberto, telaAtual, setTela }) {
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
          <small>inteligência agrícola</small>
        </div>
      </div>
      <div className="sidebar-label">navegação</div>
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${telaAtual === "visao-geral" ? "ativo" : ""}`}
          type="button"
          onClick={() => setTela("visao-geral")}
        >
          <span className="nav-glyph" aria-hidden="true">
            ●
          </span>
          <span>visão geral</span>
          <span className="nav-arrow">›</span>
        </button>
        {grupos.map((grupo) => (
          <div key={grupo.titulo}>
            <div className="sidebar-section-label">{grupo.titulo}</div>
            {grupo.itens.map(([id, nome]) => (
              <button
                className={`nav-item nav-item-muted ${telaAtual === id ? "ativo" : ""}`}
                type="button"
                key={id}
                onClick={() => setTela(id)}
              >
                <span className="nav-glyph" aria-hidden="true">
                  +
                </span>
                <span>{nome}</span>
                <span className="nav-arrow">›</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile-card">
          <span className="avatar">ps</span>
          <div>
            <strong>paola soares</strong>
            <small>equipe plume</small>
          </div>
          <span className="more">•••</span>
        </div>
        <p className="sidebar-note">dados para decidir com clareza.</p>
      </div>
    </aside>
  );
}

export default MenuLateral;
