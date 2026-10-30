import React from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarRange,
  FileSpreadsheet,
  Gauge,
  LayoutDashboard,
  LineChart,
  LogIn,
  Map,
  Ruler,
  ShieldCheck,
  Tag,
  Tractor,
  UserRound,
} from "lucide-react";

const grupos = [
  {
    titulo: "operação",
    itens: [
      { id: "safra", nome: "Safras", Icone: CalendarRange },
      { id: "unidade", nome: "Unidades", Icone: Building2 },
      { id: "equipamento", nome: "Equipamentos", Icone: Tractor },
      { id: "importacao", nome: "Importação Excel", Icone: FileSpreadsheet },
    ],
  },
  {
    titulo: "monitoramento",
    itens: [
      { id: "medicao", nome: "Medições", Icone: Gauge },
      { id: "alertas", nome: "Alertas industriais", Icone: AlertTriangle },
      { id: "mapa", nome: "Mapa", Icone: Map },
    ],
  },
  {
    titulo: "inteligência",
    itens: [
      { id: "indicadores", nome: "Indicadores", Icone: LineChart },
      { id: "relatorios", nome: "Relatórios & KPIs", Icone: BarChart3 },
    ],
  },
  {
    titulo: "configuração",
    itens: [
      { id: "tipoinformacao", nome: "Tipos de informação", Icone: Tag },
      { id: "unidademedida", nome: "Unidades de medida", Icone: Ruler },
      { id: "usuarios", nome: "Usuário e foto", Icone: UserRound },
      { id: "login", nome: "Entrar na conta", Icone: LogIn },
    ],
  },
];

function MenuLateral({
  aberto,
  telaAtual,
  setTela,
  indicadores = [],
  onSelectIndicator,
  indicadorSelecionadoId,
  sessao,
}) {
  return (
    <aside
      id="menu-lateral"
      className={`menu-lateral ${aberto ? "aberto" : "fechado"}`}
      aria-label="Menu principal de navegação"
    >
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${telaAtual === "visao-geral" ? "ativo" : ""}`}
          type="button"
          onClick={() => setTela("visao-geral")}
          aria-current={telaAtual === "visao-geral" ? "page" : undefined}
        >
          <span className="nav-glyph">
            <LayoutDashboard size={15} aria-hidden="true" />
          </span>
          <span className="nav-label">Visão geral</span>
        </button>

        {grupos.map((grupo) => (
          <div key={grupo.titulo} className="sidebar-group">
            <div className="sidebar-section-label">{grupo.titulo}</div>

            {grupo.itens.map(({ id, nome, Icone }) => (
              <button
                className={`nav-item ${telaAtual === id ? "ativo" : ""}`}
                type="button"
                key={id}
                onClick={() => setTela(id)}
                aria-current={telaAtual === id ? "page" : undefined}
              >
                <span className="nav-glyph">
                  <Icone size={15} aria-hidden="true" />
                </span>
                <span className="nav-label">{nome}</span>
              </button>
            ))}

            {grupo.titulo === "inteligência" && indicadores.length > 0 && (
              <div className="sidebar-dynamic-items" aria-label="Indicadores cadastrados">
                {indicadores.map((indicador) => {
                  const esteAtivo =
                    telaAtual === "indicadores" &&
                    String(indicadorSelecionadoId) === String(indicador.Id);

                  return (
                    <button
                      className={`nav-item nav-item-dynamic ${esteAtivo ? "ativo" : ""}`}
                      type="button"
                      key={indicador.Id}
                      title={indicador.Descricao}
                      onClick={() => {
                        onSelectIndicator?.(indicador);
                        setTela("indicadores");
                      }}
                      aria-current={esteAtivo ? "page" : undefined}
                    >
                      <span className="nav-glyph">
                        <LineChart size={13} aria-hidden="true" />
                      </span>
                      <span className="nav-label">{indicador.Nome}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-context">
          <span className="avatar" aria-hidden="true">
            <ShieldCheck size={14} />
          </span>
          <div>
            <strong>{sessao ? "organização da sessão" : "sem sessão"}</strong>
            <small>{sessao ? "dados isolados pelo servidor" : "entre para carregar dados"}</small>
          </div>
        </div>
        <p className="sidebar-note">cana intelligence · dados industriais</p>
      </div>
    </aside>
  );
}

export default MenuLateral;
