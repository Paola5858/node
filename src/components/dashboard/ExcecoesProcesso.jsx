import { ArrowRight } from 'lucide-react'

function ExcecoesProcesso({ excecoes, onNavigate }) {
  const abrirAlertas = () => onNavigate?.('alertas')

  return (
    <section className="panel excecoes" aria-labelledby="excecoes-titulo">
      <div className="panel-head">
        <h2 className="panel-title" id="excecoes-titulo">
          Exceções do processo
        </h2>
        <span className="chip">{excecoes.length} abertas</span>
      </div>

      <ul className="excecoes-lista">
        {excecoes.map((item) => (
          <li key={item.id}>
            <button type="button" className="excecao-item" onClick={abrirAlertas}>
              <span className="excecao-main">
                <span className={`excecao-dot tone-${item.tom}`} aria-hidden="true" />
                <span>
                  <span className="excecao-nome">{item.nome}</span>
                  <span className="excecao-processo">{item.processo}</span>
                </span>
              </span>
              <span className="excecao-valor">
                <strong>{item.valor}</strong>
                <span className={`excecao-status tone-${item.tom}`}>{item.status}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="link-action" onClick={abrirAlertas}>
        Abrir alertas industriais
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </section>
  )
}

export default ExcecoesProcesso
