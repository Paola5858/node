import React from "react";

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
      ["usuarios", "usuário e foto"],
      ["login", "entrar na conta"],
    ],
  },
];

// indicadorSelecionadoId: Id do indicador atualmente selecionado (passado pelo App).
// Necessário para marcar o item ativo individualmente — sem ele, todos os itens
// dinâmicos ficam com a classe "ativo" ao mesmo tempo (bug F-03 corrigido aqui).
function MenuLateral({ aberto, telaAtual, setTela, indicadores = [], onSelectIndicator, indicadorSelecionadoId, sessao }) {
  const nomeUsuario = sessao?.nome || sessao?.name || sessao?.email || "usuário";
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
            {grupo.titulo === "inteligência" && indicadores.length > 0 && (
              <div className="sidebar-dynamic-items" aria-label="Indicadores cadastrados">
                {indicadores.map((indicador) => {
                  // Compara o Id do indicador com o selecionado E exige que a tela
                  // seja "indicadores" — assim cada item é marcado individualmente.
                  const esteAtivo =
                    telaAtual === "indicadores" &&
                    String(indicadorSelecionadoId) === String(indicador.Id);
                  return (
                    <button
                      className={`nav-item nav-item-dynamic ${esteAtivo ? "ativo" : ""}`}
                      type="button"
                      key={indicador.Id}
                      title={indicador.Descricao}
                      onClick={() => { onSelectIndicator?.(indicador); setTela("indicadores"); }}
                    >
                      <span className="nav-glyph" aria-hidden="true">↳</span>
                      <span>{indicador.Nome}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile-card">
          {sessao?.foto ? <img className="avatar" src={sessao.foto} alt="" /> : <span className="avatar">{String(nomeUsuario).slice(0, 2).toLowerCase()}</span>}
          <div>
            <strong>{nomeUsuario}</strong>
            <small>{sessao ? "sessão autorizada" : "sem sessão"}</small>
          </div>
          <span className="more">•••</span>
        </div>
        <p className="sidebar-note">dados para decidir com clareza.</p>
      </div>
    </aside>
  );
}

export default MenuLateral;
