import { ArrowUpRight } from 'lucide-react'

function QualidadeBase({ qualidade, onNavigate }) {
  const abrirImportacao = () => onNavigate?.('importacao')

  const metricas = [
    { rotulo: 'Aceitos', valor: qualidade.aceitos, tom: 'tone-ok' },
    { rotulo: 'Rejeitados', valor: qualidade.rejeitados, tom: 'tone-danger' },
    { rotulo: 'Pendentes', valor: qualidade.pendentes, tom: 'tone-warn' },
    { rotulo: 'Duplicidades', valor: qualidade.duplicidades },
    { rotulo: 'Sem definição', valor: qualidade.semDefinicao },
  ]

  return (
    <section className="panel qualidade" aria-labelledby="qualidade-titulo">
      <div className="panel-head">
        <div>
          <h2 className="panel-title" id="qualidade-titulo">
            Qualidade da base
          </h2>
          <div className="qualidade-meta">
            <span className="chip">lote {qualidade.lote}</span>
            <span>{qualidade.arquivo}</span>
            <span>processado {qualidade.processadoEm}</span>
            <span>{qualidade.responsavel}</span>
          </div>
        </div>
        <div className="pagina-acoes">
          <button type="button" className="text-button" onClick={abrirImportacao}>
            Ver pendências
          </button>
          <button type="button" className="text-button" onClick={abrirImportacao}>
            Abrir importação <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="qualidade-stats">
        {metricas.map((metrica) => (
          <div className="qualidade-stat" key={metrica.rotulo}>
            <span>{metrica.rotulo}</span>
            <strong className={metrica.tom}>{metrica.valor}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

export default QualidadeBase
