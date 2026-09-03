import { useEffect, useState } from "react";
import Header from "./layouts/Header";
import MenuLateral from "./layouts/MenuLateral";
import Conteudo from "./components/Conteudo";
import CadastroPage from "./pages/CadastroPage";
import { safrasDisponiveis } from "./data/demo/operacao";
import "./App.css";

const cadastroRoutes = [
  "safra",
  "unidade",
  "equipamento",
  "medicao",
  "indicadores",
  "unidademedida",
  "tipoinformacao",
];

function rotaAtual() {
  const rota = window.location.pathname.replace(/^\//, "");
  return rota === "" ? "visao-geral" : rota;
}

function App() {
  const [menuAberto, setMenuAberto] = useState(true);
  const [rota, setRota] = useState(rotaAtual);
  const [safraId, setSafraId] = useState(safrasDisponiveis[0].id);

  useEffect(() => {
    const atualizarRota = () => setRota(rotaAtual());
    window.addEventListener("popstate", atualizarRota);
    return () => window.removeEventListener("popstate", atualizarRota);
  }, []);

  function alterarMenu() {
    setMenuAberto((aberto) => !aberto);
  }

  function navegar(novaRota) {
    const destino = novaRota === "inicio" ? "visao-geral" : novaRota;
    window.history.pushState(
      {},
      "",
      destino === "visao-geral" ? "/" : `/${destino}`,
    );
    setRota(destino);
    if (window.innerWidth < 900) setMenuAberto(false);
  }

  const safraAtual =
    safraId === "todas"
      ? {
          id: "todas",
          nome: "todas as safras",
          descricao: "visão consolidada",
          progresso: 0,
          status: "sem dados no período",
        }
      : safrasDisponiveis.find((safra) => safra.id === safraId) ||
        safrasDisponiveis[0];
  const paginaCadastro = cadastroRoutes.includes(rota);
  const tituloRota = paginaCadastro
    ? "cadastros"
    : rota === "visao-geral"
      ? "visão geral"
      : rota;

  return (
    <div className="app-shell">
      <Header
        safraAtual={safraAtual}
        safras={safrasDisponiveis}
        onChangeSafra={setSafraId}
      />
      <div className="layout">
        <MenuLateral aberto={menuAberto} telaAtual={rota} setTela={navegar} />
        <main className="area-conteudo">
          <div className="content-toolbar">
            <button
              className="toolbar-button"
              type="button"
              onClick={alterarMenu}
              aria-label="Abrir ou fechar menu lateral"
            >
              <span className="toolbar-icon" aria-hidden="true">
                {menuAberto ? "×" : "+"}
              </span>
              <span>{menuAberto ? "recolher menu" : "abrir menu"}</span>
            </button>
            <div className="breadcrumb" aria-label="Navegação atual">
              <span>plume</span>
              <span>/</span>
              <strong>{tituloRota}</strong>
            </div>
            <span className="status-pill" title="Fonte local demonstrativa">
              <span className="status-dot" /> dados locais
            </span>
          </div>
          {rota === "visao-geral" ? (
            <Conteudo onNavigate={navegar} safraAtual={safraAtual} />
          ) : paginaCadastro ? (
            <CadastroPage key={rota} tipo={rota} />
          ) : (
            <section className="empty-page">
              <span className="eyebrow">
                <span className="eyebrow-line" /> módulo em preparação
              </span>
              <h1>{tituloRota}</h1>
              <p>
                Este espaço está reservado para a próxima camada da operação.
                Nenhum dado foi inventado aqui.
              </p>
              <button
                className="button-primary"
                type="button"
                onClick={() => navegar("visao-geral")}
              >
                voltar para visão geral <span>→</span>
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
