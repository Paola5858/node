import ContextSelector from "../components/common/ContextSelector";

function Header({ safraAtual, safras, onChangeSafra }) {
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
        <span className="header-avatar">ps</span>
      </div>
    </header>
  );
}

export default Header;
