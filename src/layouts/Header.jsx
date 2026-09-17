import ContextSelector from "../components/common/ContextSelector";

function Header({ safraAtual, safras, onChangeSafra, sessao, onLogout }) {
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
            <span className="header-session">{sessao.nome}</span>
            <button className="header-logout" type="button" onClick={onLogout}>sair</button>
            <span className="header-avatar">{sessao.nome.slice(0, 2).toLowerCase()}</span>
          </>
        ) : (
          <span className="header-login">acesso local</span>
        )}
      </div>
    </header>
  );
}

export default Header;
