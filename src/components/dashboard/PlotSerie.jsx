import { ALTURA_PLOT, LARGURA_PLOT, formatarValor, pontosDaSerie } from './plotUtils'

const linhasGrade = [0, 0.5, 1].map((fracao) => Number((fracao * ALTURA_PLOT).toFixed(2)))

function PlotSerie({ serie, rotulos }) {
  const pontos = pontosDaSerie(serie)
  const linha = pontos.map((ponto) => `${ponto.x},${ponto.y}`).join(' ')
  const area = `${pontos[0].x},${ALTURA_PLOT} ${linha} ${pontos[pontos.length - 1].x},${ALTURA_PLOT}`
  const ultimo = pontos[pontos.length - 1]
  const gradiente = `gradiente-${serie.id}`
  const descricao = `${serie.nome} em ${serie.unidade}: ${rotulos.length} médias mensais, de ${formatarValor(serie.min)} a ${formatarValor(serie.max)}.`

  return (
    <div className="chart-plot">
      <p className="chart-plot-head">
        {serie.nome} <span>{serie.unidade}</span>
      </p>
      <div className="chart-body">
        <div className="chart-y" aria-hidden="true">
          {serie.ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="chart-canvas">
          <svg viewBox={`0 0 ${LARGURA_PLOT} ${ALTURA_PLOT}`} preserveAspectRatio="none" role="img" aria-label={descricao}>
            <defs>
              <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={serie.cor} stopOpacity="0.18" />
                <stop offset="100%" stopColor={serie.cor} stopOpacity="0" />
              </linearGradient>
            </defs>

            {linhasGrade.map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2={LARGURA_PLOT}
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {serie.area && <polygon points={area} fill={`url(#${gradiente})`} />}

            <polyline
              points={linha}
              fill="none"
              stroke={serie.cor}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {pontos.map((ponto) => (
              <circle key={ponto.indice} cx={ponto.x} cy={ponto.y} r="7" fill="transparent">
                <title>{`${rotulos[ponto.indice]}: ${formatarValor(ponto.valor)} ${serie.unidade}`}</title>
              </circle>
            ))}

            <circle cx={ultimo.x} cy={ultimo.y} r="3" fill={serie.cor} />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default PlotSerie
