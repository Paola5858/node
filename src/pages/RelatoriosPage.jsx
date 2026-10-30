import React, { useState } from 'react'

const SAFRAS_HISTORICO = [
  { safra: '2026/27 (Atual)', moagemTotalT: 2850400, atrMedio: 138.8, etanolM3: 114500, acucarSc: 3120000, extracaoPct: 96.1, status: 'Em andamento' },
  { safra: '2025/26 (Encerrada)', moagemTotalT: 3410200, atrMedio: 136.2, etanolM3: 139800, acucarSc: 3680000, extracaoPct: 95.8, status: 'Consolidada' },
  { safra: '2024/25 (Histórica)', moagemTotalT: 3180000, atrMedio: 139.5, etanolM3: 128400, acucarSc: 3510000, extracaoPct: 95.6, status: 'Consolidada' },
]

function RelatoriosPage() {
  const [safraSelecionada, setSafraSelecionada] = useState('2026/27 (Atual)')
  const [periodoFiltro, setPeriodoFiltro] = useState('mensal')

  const safraDados = SAFRAS_HISTORICO.find((s) => s.safra === safraSelecionada) || SAFRAS_HISTORICO[0]

  return (
    <section className="relatorios-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-line" /> inteligência / relatórios industriais
          </span>
          <h1>
            balanço e <em>kpis da operação.</em>
          </h1>
          <p>
            Consolidação dos balanços de massa, produção de açúcar, etanol, rendimento industrial e eficiência agrícola por safra.
          </p>
        </div>
        <div className="step-badge">
          <strong>KPI</strong>
          <span>balanço<br />de massa</span>
        </div>
      </div>

      {/* Controles de Filtro */}
      <div className="glass-card indicator-toolbar">
        <div>
          <span className="mini-label">safra em análise</span>
          <h2>{safraDados.safra}</h2>
        </div>

        <div className="indicator-actions">
          <select
            value={safraSelecionada}
            onChange={(e) => setSafraSelecionada(e.target.value)}
            className="tabela-select"
            aria-label="Selecionar safra"
          >
            {SAFRAS_HISTORICO.map((s) => (
              <option key={s.safra} value={s.safra}>
                {s.safra}
              </option>
            ))}
          </select>

          <select
            value={periodoFiltro}
            onChange={(e) => setPeriodoFiltro(e.target.value)}
            className="tabela-select"
            aria-label="Selecionar agregação temporal"
          >
            <option value="diario">Visão Diária / Turno</option>
            <option value="semanal">Semanal (Semana Safra)</option>
            <option value="mensal">Consolidado Mensal</option>
            <option value="acumulado">Acumulado Safra</option>
          </select>

          <button
            type="button"
            className="button-ghost"
            onClick={() => window.print()}
            title="Imprimir relatório executivo"
          >
            imprimir relatório ↗
          </button>
        </div>
      </div>
      {/* Grid de Balanço de Massa */}
      <div className="metric-row">
        <div className="metric-card">
          <span className="metric-label">moagem de cana</span>
          <strong>{(safraDados.moagemTotalT / 1000).toLocaleString('pt-BR')} mil t</strong>
          <span className="metric-caption">toneladas de matéria-prima processada</span>
        </div>

        <div className="metric-card accent">
          <span className="metric-label">atr médio acumulado</span>
          <strong>{safraDados.atrMedio}</strong>
          <span className="metric-caption">kg ATR / tonelada de cana</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">eficiência de extração</span>
          <strong>{safraDados.extracaoPct}%</strong>
          <span className="metric-caption">Pol extraída nos ternos da moenda</span>
        </div>
      </div>

      {/* Produção Acumulada */}
      <div className="overview-grid">
        <div className="glass-card overview-card">
          <div className="card-heading">
            <div>
              <span className="mini-label">mix de produção</span>
              <h2>distribuição de derivados</h2>
            </div>
            <span className="card-index">industrial</span>
          </div>

          <div className="producao-detalhe-grid">
            <div className="producao-item">
              <span className="mini-label">etanol total</span>
              <strong>{safraDados.etanolM3.toLocaleString('pt-BR')} m³</strong>
              <small>Etanol hidratado combustível + anidro</small>
            </div>

            <div className="producao-item">
              <span className="mini-label">açúcar vhp / cristal</span>
              <strong>{(safraDados.acucarSc / 1000).toLocaleString('pt-BR')} mil sc</strong>
              <small>Sacas de 50 kg convecionadas</small>
            </div>
          </div>

          <p>
            O balanço de massa respeita as equivalências estequiométricas industriais:
            1 kg de ATR equivale teoricamente a 0,611 litros de etanol anidro ou 1,041 kg de açúcar cristal padrão.
          </p>
        </div>

        {/* Tabela de Comparativo entre Safras */}
        <div className="glass-card activity-card">
          <div className="card-heading">
            <div>
              <span className="mini-label">histórico comparativo</span>
              <h2>safras recentes</h2>
            </div>
          </div>

          <div className="tabela-scroll" style={{ marginTop: '16px' }}>
            <table className="dados-tabela">
              <thead>
                <tr>
                  <th>Safra</th>
                  <th>Moagem (t)</th>
                  <th>ATR Médio</th>
                  <th>Extração</th>
                </tr>
              </thead>
              <tbody>
                {SAFRAS_HISTORICO.map((item) => (
                  <tr key={item.safra} style={{ fontWeight: item.safra === safraSelecionada ? '600' : 'normal' }}>
                    <td>{item.safra}</td>
                    <td>{item.moagemTotalT.toLocaleString('pt-BR')}</td>
                    <td>{item.atrMedio}</td>
                    <td>{item.extracaoPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

export default RelatoriosPage;

