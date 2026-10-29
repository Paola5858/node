import React, { useCallback, useEffect, useState } from "react";
import Header from "./layouts/Header";
import MenuLateral from "./layouts/MenuLateral";
import Conteudo from "./components/Conteudo";
import UsuariosPage from "./pages/UsuariosPage";
import LoginPage from "./pages/LoginPage";
import IndicadoresPage from "./pages/IndicadoresPage";
import CadastroApi from "./components/CadastroApi";
import { safrasDisponiveis } from "./data/demo/operacao";
import { authService } from "./services/authService";
import { removerSenhaLocalLegada } from "./data/storage";
import { indicadorService, normalizarIndicador } from "./services/indicadorService";
import "./App.css";

// "indicadores" foi removido: a rota é tratada por IndicadoresPage (CRUD real via API),
// não pelo CadastroPage genérico. Mantê-la aqui seria código morto com conflito de rota.
const cadastroRoutes = [
  "safra",
  "unidade",
  "equipamento",
  "medicao",
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
  const [sessao, setSessao] = useState(null);
  const [estadoSessao, setEstadoSessao] = useState("verificando");
  const [erroLogout, setErroLogout] = useState("");
  const [indicadores, setIndicadores] = useState([]);
  const [indicadorSelecionado, setIndicadorSelecionado] = useState(null);

  const atualizarIndicadores = useCallback((novosItens) => {
    setIndicadores(novosItens);
    setIndicadorSelecionado((atual) => {
      if (!atual) return null;
      return novosItens.find((item) => String(item.Id) === String(atual.Id)) || null;
    });
  }, []);

  useEffect(() => {
    let ativo = true;
    removerSenhaLocalLegada();
    authService.sessao().then((usuario) => {
      if (!ativo) return;
      setSessao(usuario);
      setEstadoSessao(usuario ? "autenticado" : "anonimo");
    }).catch(() => {
      if (!ativo) return;
      setSessao(null);
      setEstadoSessao("anonimo");
    });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (estadoSessao !== "autenticado") return;
    indicadorService
      .listar()
      .then((dados) => atualizarIndicadores(dados.map(normalizarIndicador)))
      .catch(() => setIndicadores([]));
  }, [atualizarIndicadores, estadoSessao]);

  useEffect(() => {
    const atualizarRota = () => setRota(rotaAtual());
    window.addEventListener("popstate", atualizarRota);
    return () => window.removeEventListener("popstate", atualizarRota);
  }, []);

  useEffect(() => {
    const atualizarPerfil = (event) => setSessao((atual) => atual ? { ...atual, ...event.detail } : atual);
    window.addEventListener("plume:profile-updated", atualizarPerfil);
    return () => window.removeEventListener("plume:profile-updated", atualizarPerfil);
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

  async function sair() {
    setErroLogout("");
    try {
      await authService.sair();
      setSessao(null);
      setEstadoSessao("anonimo");
      navegar("login");
    } catch (error) {
      setErroLogout(`não foi possível encerrar a sessão no servidor: ${error.message}`);
    }
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
  const rotaPublica = rota === "login" || rota === "usuarios";

  return (
    <div className="app-shell">
      <Header
        safraAtual={safraAtual}
        safras={safrasDisponiveis}
        onChangeSafra={setSafraId}
        sessao={sessao}
        onLogout={sair}
      />
      <div className="layout">
        <MenuLateral
          aberto={menuAberto}
          telaAtual={rota}
          setTela={navegar}
          indicadores={indicadores}
          sessao={sessao}
          onSelectIndicator={setIndicadorSelecionado}
          indicadorSelecionadoId={indicadorSelecionado?.Id}
        />
        <main className="area-conteudo">
          {erroLogout && <div className="error-feedback" role="alert">{erroLogout}</div>}
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
            <span className="status-pill" title="Dados estáticos de demonstração, não leituras reais da operação">
              <span className="status-dot" /> dados de demonstração
            </span>
          </div>
          {estadoSessao === "verificando" ? (
            <div className="indicator-state" role="status"><strong>verificando sessão...</strong><small>aguardando confirmação do servidor.</small></div>
          ) : !rotaPublica && estadoSessao !== "autenticado" ? (
            <LoginPage onAuthenticated={(usuario) => { setSessao(usuario); setEstadoSessao("autenticado"); navegar("visao-geral"); }} onNavigate={navegar} />
          ) : rota === "login" ? (
            <LoginPage onAuthenticated={(usuario) => { setSessao(usuario); setEstadoSessao("autenticado"); navegar("visao-geral"); }} onNavigate={navegar} />
          ) : rota === "usuarios" ? (
            <UsuariosPage onNavigate={navegar} />
          ) : rota === "indicadores" ? (
            <IndicadoresPage
              sessao={sessao}
              initialSelectedId={indicadorSelecionado?.Id}
              onItemsChange={atualizarIndicadores}
              onSelect={setIndicadorSelecionado}
            />
          ) : rota === "visao-geral" ? (
            <Conteudo onNavigate={navegar} safraAtual={safraAtual} />
          ) : paginaCadastro ? (
            <CadastroApi key={rota} recurso={rota} />
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
