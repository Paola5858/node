function Conteudo({ onNavigate }) {
  return (
    <section className="home-page">
      <div className="home-topline">
        <span className="eyebrow">
          <span className="eyebrow-line" /> centro operacional
        </span>
        <span className="demo-badge">ambiente de demonstração</span>
      </div>
      <div className="hero-copy">
        <h1>
          visão da
          <br />
          <em>operação.</em>
        </h1>
        <p>
          um ponto de partida para acompanhar safras, unidades e os sinais que
          pedem atenção.
        </p>
      </div>
      <div className="operation-context">
        <div>
          <span className="mini-label">safra em contexto</span>
          <strong>safra 2026/27</strong>
          <span>ciclo produtivo principal</span>
        </div>
        <div className="context-progress">
          <span>configuração inicial</span>
          <div>
            <i style={{ width: "38%" }} />
          </div>
          <strong>38%</strong>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={() => onNavigate("safra")}
        >
          abrir safra <span>↗</span>
        </button>
      </div>
      <div className="metric-row">
        <div className="metric-card">
          <span className="metric-label">entidades do domínio</span>
          <strong>07</strong>
          <span className="metric-caption">cadastros disponíveis</span>
        </div>
        <div className="metric-card accent">
          <span className="metric-label">atenção necessária</span>
          <strong>01</strong>
          <span className="metric-caption">configuração pendente</span>
        </div>
        <div className="signal-card">
          <div>
            <span className="metric-label">sinal da operação</span>
            <strong>base em construção</strong>
          </div>
          <span className="signal-indicator">
            <i /> estável
          </span>
        </div>
      </div>
      <div className="overview-grid">
        <div className="glass-card overview-card">
          <div className="card-heading">
            <div>
              <span className="mini-label">próximo movimento</span>
              <h2>comece definindo o ciclo.</h2>
            </div>
            <span className="card-index">01 / 03</span>
          </div>
          <p>
            A safra conecta o restante da operação. Depois dela, unidades,
            equipamentos e medições ganham contexto.
          </p>
          <button
            className="button-primary"
            type="button"
            onClick={() => onNavigate("safra")}
          >
            configurar safra <span>→</span>
          </button>
        </div>
        <div className="glass-card activity-card">
          <div className="card-heading">
            <div>
              <span className="mini-label">atividade recente</span>
              <h2>linha do tempo</h2>
            </div>
            <span className="live-label">
              <i /> agora
            </span>
          </div>
          <div className="activity-item">
            <span className="activity-marker done">✓</span>
            <div>
              <strong>ambiente iniciado</strong>
              <small>estrutura pronta para novos registros</small>
            </div>
            <time>agora</time>
          </div>
          <div className="activity-item">
            <span className="activity-marker">02</span>
            <div>
              <strong>próximo: cadastrar unidade</strong>
              <small>adicione o primeiro ponto da operação</small>
            </div>
            <time>pendente</time>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Conteudo
