import PlotSerie from './PlotSerie'
import { formatarValor } from './plotUtils'

function HistoricoSafra({ historico }) {
  const { subtitulo, rotulos, series } = historico

  return (
    <section className="panel historico" aria-labelledby="historico-titulo">
      <div className="panel-head">
        <div>
          <h2 className="panel-title" id="historico-titulo">
            Histórico da safra
          </h2>
          <p className="panel-sub">{subtitulo}</p>
        </div>
        <ul className="chart-legend">
          {series.map((serie) => (
            <li key={serie.id}>
              <span className="swatch" style={{ background: serie.cor }} aria-hidden="true" />
              {serie.nome}
            </li>
          ))}
        </ul>
      </div>

      {series.map((serie) => (
        <PlotSerie key={serie.id} serie={serie} rotulos={rotulos} />
      ))}

      <div className="chart-eixo" aria-hidden="true">
        {rotulos.map((rotulo) => (
          <span className="chart-x-label" key={rotulo}>
            {rotulo}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Histórico mensal de {series.map((serie) => serie.nome).join(' e ')}</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            {series.map((serie) => (
              <th key={serie.id} scope="col">
                {serie.nome} ({serie.unidade})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rotulos.map((rotulo, indice) => (
            <tr key={rotulo}>
              <th scope="row">{rotulo}</th>
              {series.map((serie) => (
                <td key={serie.id}>{formatarValor(serie.valores[indice])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default HistoricoSafra
