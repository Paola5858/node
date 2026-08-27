function Conteudo({ onNavigate }) {
  return (
    <section className="home-page">
      <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-line" /> visão geral</span><h1>olá, paola.<br /><em>vamos organizar</em> boas ideias?</h1><p>um espaço simples para transformar dados soltos em decisões mais claras.</p></div>
      <div className="metric-row"><div className="metric-card"><span className="metric-label">cadastros disponíveis</span><strong>07</strong><span className="metric-caption">modelos prontos para usar</span></div><div className="metric-card accent"><span className="metric-label">etapa atual</span><strong>01</strong><span className="metric-caption">safra, seu primeiro modelo</span></div><div className="quote-card"><span className="quote-mark">“</span><p>clareza também é uma forma de cuidado.</p><span className="quote-author">plume notes / 01</span></div></div>
      <div className="overview-grid"><div className="glass-card overview-card"><div className="card-heading"><div><span className="mini-label">comece por aqui</span><h2>um formulário, vários aprendizados.</h2></div><span className="card-index">01 / 03</span></div><p>nesta etapa, você pratica estado, props, eventos, validação e renderização condicional, sem esconder a lógica atrás de uma API mágica.</p><button className="button-primary" type="button" onClick={() => onNavigate('safra')}>abrir cadastro de safra <span>→</span></button></div><div className="glass-card principle-card"><span className="mini-label">princípios do projeto</span><div className="principle-list"><div><span>01</span><strong>controlado</strong><small>o estado acompanha cada campo.</small></div><div><span>02</span><strong>atento</strong><small>erros aparecem onde importam.</small></div><div><span>03</span><strong>humano</strong><small>feedback claro, sem bronca.</small></div></div></div></div>
    </section>
  )
}

export default Conteudo
