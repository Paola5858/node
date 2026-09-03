import { useState } from 'react'
import Header from "./layouts/Header";
import MenuLateral from "./layouts/MenuLateral";
import Conteudo from "./components/Conteudo";
import CadastroPage from "./pages/CadastroPage";
import "./App.css";

function App() {
  const [menuAberto, setMenuAberto] = useState(true);
  const [tela, setTela] = useState("inicio");

  function alterarMenu() {
    setMenuAberto((aberto) => !aberto);
  }

  function selecionarTela(novaTela) {
    setTela(novaTela);
    if (window.innerWidth < 900) setMenuAberto(false);
  }

  return (
    <div className="app-shell">
      <Header menuAberto={menuAberto} onToggleMenu={alterarMenu} />
      <div className="layout">
        <MenuLateral
          aberto={menuAberto}
          telaAtual={tela}
          setTela={selecionarTela}
        />
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
              <span>workspace</span>
              <span>/</span>
              <strong>{tela === "inicio" ? "visão geral" : "cadastros"}</strong>
            </div>
            <span className="status-pill">
              <span className="status-dot" /> sistema online
            </span>
          </div>
          {tela === "inicio" ? (
            <Conteudo onNavigate={selecionarTela} />
          ) : (
            <CadastroPage key={tela} tipo={tela} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App
