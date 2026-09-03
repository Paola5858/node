import { dashboardData } from "../data/demo/operacao";

function Conteudo({ onNavigate, safraAtual }) {
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
          <strong>{safraAtual.nome}</strong>
          <span>{safraAtual.descricao}</span>
        </div>
        <div className="context-progress">
          <span>{safraAtual.status}</span>
          <div>
            <i style={{ width: `${safraAtual.progresso}%` }} />
          </div>
          <strong>{safraAtual.progresso}%</strong>
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
          <strong>{dashboardData.metricas[0].valor}</strong>
          <span className="metric-caption">
            {dashboardData.metricas[0].legenda}
          </span>
        </div>
        <div className="metric-card accent">
          <span className="metric-label">atenção necessária</span>
          <strong>{dashboardData.metricas[1].valor}</strong>
          <span className="metric-caption">
            {dashboardData.metricas[1].legenda}
          </span>
        </div>
        <div className="signal-card">
          <div>
            <span className="metric-label">sinal da operação</span>
            <strong>{dashboardData.sinais.titulo}</strong>
          </div>
          <span className="signal-indicator">
            <i /> leitura pendente
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
              <i /> dados locais
            </span>
          </div>
          {dashboardData.atividade.map((evento, index) => (
            <div className="activity-item" key={evento.titulo}>
              <span
                className={`activity-marker ${evento.estado === "concluído" ? "done" : ""}`}
              >
                {evento.estado === "concluído" ? "✓" : `0${index + 2}`}
              </span>
              <div>
                <strong>{evento.titulo}</strong>
                <small>{evento.detalhe}</small>
              </div>
              <time>{evento.quando}</time>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Conteudo;
