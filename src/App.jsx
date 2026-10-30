import React, { useCallback, useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Header from "./layouts/Header";
import MenuLateral from "./layouts/MenuLateral";
import Conteudo from "./components/Conteudo";
import UsuariosPage from "./pages/UsuariosPage";
import LoginPage from "./pages/LoginPage";
import IndicadoresPage from "./pages/IndicadoresPage";
import ImportacaoExcelPage from "./pages/ImportacaoExcelPage";
import AlertasIndustriaisPage from "./pages/AlertasIndustriaisPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import CadastroApi from "./components/CadastroApi";
import { safrasDisponiveis } from "./data/demo/operacao";
import { authService } from "./services/authService";
import { removerSenhaLocalLegada } from "./data/storage";
import { indicadorService, normalizarIndicador } from "./services/indicadorService";
import "./App.css";

// Rotas genéricas de cadastro de entidades
const cadastroRoutes = [
  "safra",
  "unidade",
  "equipamento",
  "medicao",
  "unidademedida",
  "tipoinformacao",
];

// Agrupamento usado na trilha de navegação do cabeçalho de conteúdo.
const grupoPorRota = {
  "visao-geral": "operação",
  safra: "operação",
  unidade: "operação",
  equipamento: "operação",
  importacao: "operação",
  medicao: "monitoramento",
  alertas: "monitoramento",
  mapa: "monitoramento",
  indicadores: "inteligência",
  relatorios: "inteligência",
  tipoinformacao: "configuração",
  unidademedida: "configuração",
  usuarios: "configuração",
  login: "conta",
};

function rotaAtual() {
  const rota = window.location.pathname.replace(/^\//, "");
  return rota === "" ? "visao-geral" : rota;
}

function App() {
  const [menuAberto, setMenuAberto] = useState(() => window.innerWidth > 1024);
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
    if (window.innerWidth < 1024) setMenuAberto(false);
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
  const grupoAtual = grupoPorRota[rota] || (paginaCadastro ? "cadastros" : "operação");

  // Antes da sessão existir não há navegação a exibir: o login ocupa a tela.
  const semShell =
    estadoSessao === "verificando" ||
    rota === "login" ||
    (!rotaPublica && estadoSessao !== "autenticado");

  if (semShell) {
    return (
      <div className="app-shell">
        <main className="area-conteudo">
          {estadoSessao === "verificando" && rota !== "login" ? (
            <div className="auth-loading" role="status">
              <strong>verificando sessão...</strong>
              <small>aguardando confirmação do servidor.</small>
            </div>
          ) : (
            <LoginPage
              onAuthenticated={(usuario) => {
                setSessao(usuario);
                setEstadoSessao("autenticado");
                navegar("visao-geral");
              }}
              onNavigate={navegar}
            />
          )}
        </main>
      </div>
    );
  }

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
              aria-label={menuAberto ? "Recolher menu lateral" : "Abrir menu lateral"}
              aria-expanded={menuAberto}
              aria-controls="menu-lateral"
            >
              <span className="toolbar-icon" aria-hidden="true">
                {menuAberto ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </span>
              <span>{menuAberto ? "recolher" : "abrir menu"}</span>
            </button>
            <nav className="breadcrumb" aria-label="Navegação atual">
              <span>{grupoAtual}</span>
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              <strong>{tituloRota}</strong>
            </nav>
            <span
              className={`status-pill ${sessao ? "is-online" : ""}`}
              title={sessao ? "Sessão confirmada pelo servidor" : "Nenhuma sessão confirmada"}
            >
              <span className="status-dot" aria-hidden="true" />
              {sessao ? "sessão autenticada" : "sem sessão"}
            </span>
          </div>
          {rota === "usuarios" ? (
            <UsuariosPage onNavigate={navegar} />
          ) : rota === "indicadores" ? (
            <IndicadoresPage
              sessao={sessao}
              initialSelectedId={indicadorSelecionado?.Id}
              onItemsChange={atualizarIndicadores}
              onSelect={setIndicadorSelecionado}
            />
          ) : rota === "importacao" ? (
            <ImportacaoExcelPage sessao={sessao} />
          ) : rota === "alertas" ? (
            <AlertasIndustriaisPage />
          ) : rota === "relatorios" ? (
            <RelatoriosPage />
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
                Nenhum dado fictício foi inventado aqui.
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
