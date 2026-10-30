import { CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react'

function KpiEstado({ kpi }) {
  if (kpi.variacao) {
    const Seta = kpi.variacao.direcao === 'alta' ? TrendingUp : TrendingDown
    return (
      <p className="kpi-state">
        <Seta size={13} aria-hidden="true" />
        {kpi.variacao.texto}
      </p>
    )
  }

  const tom = kpi.estadoTom || kpi.tom
  return (
    <p className={`kpi-state tone-${tom}`}>
      {kpi.estadoTom === 'ok' ? (
        <CheckCircle2 size={13} aria-hidden="true" />
      ) : (
        <span className="dot" aria-hidden="true" />
      )}
      {kpi.estado}
    </p>
  )
}

function KpiBand({ kpis }) {
  return (
    <section className="kpi-band" aria-label="Indicadores da safra">
      {kpis.map((kpi) => (
        <article className="kpi-cell" key={kpi.id}>
          <span className="kpi-label">{kpi.nome}</span>
          <p className={`kpi-value ${kpi.tom ? `tone-${kpi.tom}` : ''}`}>
            <strong>{kpi.valor}</strong>
            <span>{kpi.unidade}</span>
          </p>
          <KpiEstado kpi={kpi} />
          <p className="kpi-foot">{kpi.nota}</p>
        </article>
      ))}
    </section>
  )
}

export default KpiBand
