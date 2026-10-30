import React from "react";
import { FileSpreadsheet } from "lucide-react";
import { visaoGeral } from "../data/demo/operacao";
import ExcecoesProcesso from "./dashboard/ExcecoesProcesso";
import HistoricoSafra from "./dashboard/HistoricoSafra";
import KpiBand from "./dashboard/KpiBand";
import QualidadeBase from "./dashboard/QualidadeBase";

function Conteudo({ onNavigate, safraAtual }) {
  const { meta, kpis, historico, excecoes, qualidade } = visaoGeral;

  return (
    <section className="visao-geral">
      <div className="pagina-cabecalho">
        <div>
          <h1 className="pagina-titulo">Visão geral</h1>
          <div className="pagina-meta">
            <span>{safraAtual?.nome ?? "safra em contexto"}</span>
            {safraAtual?.descricao && <span>{safraAtual.descricao}</span>}
            <span>{meta.periodo}</span>
            <span>{meta.unidadesComRegistros} unidades com registros</span>
            <span>última medição {meta.ultimaMedicao}</span>
          </div>
        </div>
        <div className="pagina-acoes">
          <span className="demo-badge">ambiente de demonstração</span>
          <button
            className="button-primary"
            type="button"
            onClick={() => onNavigate?.("importacao")}
          >
            <FileSpreadsheet size={14} aria-hidden="true" />
            Importar arquivo
          </button>
        </div>
      </div>

      <KpiBand kpis={kpis} />

      <div className="painel-grid">
        <HistoricoSafra historico={historico} />
        <ExcecoesProcesso excecoes={excecoes} onNavigate={onNavigate} />
      </div>

      <QualidadeBase qualidade={qualidade} onNavigate={onNavigate} />
    </section>
  );
}

export default Conteudo;
