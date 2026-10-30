import React, { useState, useMemo } from 'react'
import { Search } from 'lucide-react'

const PROCESSOS_INDUSTRIAIS = [
  { id: 'todos', nome: 'visão integrada', descricao: 'visão integrada da usina' },
  { id: 'qualidade_cana', nome: 'qualidade da cana', descricao: 'qualidade da matéria-prima & ATR' },
  { id: 'moagem', nome: 'extração & moenda', descricao: 'extração & moenda' },
  { id: 'fermentacao', nome: 'fermentação', descricao: 'fermentação & destilaria' },
  { id: 'paradas', nome: 'paradas', descricao: 'paradas & eventos operacionais' },
]

const ROTULO_PROCESSO = {
  qualidade_cana: 'qualidade da cana',
  moagem: 'extração & moenda',
  fermentacao: 'fermentação & destilaria',
  paradas: 'paradas & eventos',
}

const STATUS = {
  critico: { rotulo: 'crítico', classe: 'status-critico' },
  alerta: { rotulo: 'acima da faixa', classe: 'status-alerta' },
  normal: { rotulo: 'na faixa', classe: 'status-normal' },
  parada_operacional: { rotulo: 'parada operacional', classe: 'status-parada' },
}

// Base de medições industriais representativa com parâmetros de usina sucroenergética
const MONITORAMENTO_BASE = [
  {
    id: 1,
    processo: 'qualidade_cana',
    indicador: 'ATR (Açúcar Total Recuperável)',
    valor: 139.4,
    unidade: 'kg/t cana',
    faixaPadrao: '125.0 - 145.0',
    status: 'normal',
    gravidade: 'baixa',
    detalhe: 'Matéria-prima em excelente maturação. Brix médio 19.8°, Pol cana 14.2%, AR 0.75%.',
    formula: 'ATR = 9.5262 × Pol + 8.9715 × ARC (Consecana)',
    data: 'Hoje, 09:15',
  },
  {
    id: 2,
    processo: 'qualidade_cana',
    indicador: 'Pureza do Caldo Primário',
    valor: 82.6,
    unidade: '%',
    faixaPadrao: '80.0 - 88.0',
    status: 'normal',
    gravidade: 'baixa',
    detalhe: 'Relação Pol / Brix adequada. Baixo teor de impurezas minerais e vegetais no descarregamento.',
    formula: 'Pureza = (Pol / Brix) × 100',
    data: 'Hoje, 09:30',
  },
  {
    id: 3,
    processo: 'moagem',
    indicador: 'Pol do Bagaço',
    valor: 2.15,
    unidade: '%',
    faixaPadrao: '1.40 - 1.90',
    status: 'alerta',
    gravidade: 'media',
    detalhe: 'Leitura acima da faixa operacional de referência. Possível perda de sacarose no último terno da moenda.',
    formula: 'Sacarose residual no bagaço pós-extração',
    data: 'Hoje, 10:00',
    acaoSugerida: 'Verificar taxa de embebição composta no 4º e 5º ternos e regulagem de abertura de rolos.',
  },
  {
    id: 4,
    processo: 'moagem',
    indicador: 'Eficiência de Extração',
    valor: 95.8,
    unidade: '%',
    faixaPadrao: '95.5 - 97.0',
    status: 'normal',
    gravidade: 'baixa',
    detalhe: 'Extração global de Pol dentro das metas do balanço de massa da moagem.',
    formula: 'Extração = [(Pol Cana - Perda Bagaço) / Pol Cana] × 100',
    data: 'Hoje, 10:15',
  },
  {
    id: 5,
    processo: 'fermentacao',
    indicador: 'Contaminação por Ácido Lático',
    valor: 2.4,
    unidade: 'g/L',
    faixaPadrao: '0.50 - 1.50',
    status: 'critico',
    gravidade: 'alta',
    detalhe: 'Proliferação de bactérias láticas (Lactobacillus sp.). Consumo indevido de açúcares fermentescíveis.',
    formula: 'Acidez por cromatografia / titulometria no mosto fermentado',
    data: 'Hoje, 10:45',
    acaoSugerida: 'Aplicar dosagem de biocida e choque térmico nas dornas 3 e 4. Acompanhar viabilidade celular.',
  },
  {
    id: 6,
    processo: 'fermentacao',
    indicador: 'Viabilidade Celular da Levedura',
    valor: 79.5,
    unidade: '%',
    faixaPadrao: '82.0 - 92.0',
    status: 'alerta',
    gravidade: 'media',
    detalhe: 'Queda moderada na população viva de Saccharomyces cerevisiae decorrente do estresse osmótico e acidez.',
    formula: 'Contagem diferencial microscópica com azul de metileno',
    data: 'Hoje, 11:00',
    acaoSugerida: 'Reduzir teor alcoólico do vinho e otimizar tempo de repouso no pé-de-cuba.',
  },
  {
    id: 7,
    processo: 'paradas',
    indicador: 'Parada Não Programada — Moenda 1',
    valor: 45,
    unidade: 'minutos',
    faixaPadrao: '0 - 15',
    status: 'parada_operacional',
    gravidade: 'alta',
    detalhe: 'Interrupção por chuva forte no bloco agrícola 14 e embuchamento do picador secundário.',
    formula: 'Classificação: Evento Operacional Real (não descartar nem diluir como dia de moagem ativa)',
    data: 'Hoje, 07:15 às 08:00',
    acaoSugerida: 'Isolar médias horárias deste período para não distorcer a taxa contínua de moagem (TCH).',
  },
]

function AlertasIndustriaisPage() {
  const [filtroProcesso, setFiltroProcesso] = useState('todos')
  const [apenasAlertas, setApenasAlertas] = useState(false)
  const [busca, setBusca] = useState('')
  const [itemSelecionado, setItemSelecionado] = useState(null)

  const itensFiltrados = useMemo(() => {
    return MONITORAMENTO_BASE.filter((item) => {
      if (filtroProcesso !== 'todos' && item.processo !== filtroProcesso) return false
      if (apenasAlertas && item.status === 'normal') return false
      if (busca.trim()) {
        const b = busca.toLowerCase()
        return (
          item.indicador.toLowerCase().includes(b) ||
          item.detalhe.toLowerCase().includes(b) ||
          item.unidade.toLowerCase().includes(b)
        )
      }
      return true
    })
  }, [filtroProcesso, apenasAlertas, busca])

  const kpis = useMemo(() => {
    const total = MONITORAMENTO_BASE.length
    const criticos = MONITORAMENTO_BASE.filter((i) => i.status === 'critico').length
    const alertas = MONITORAMENTO_BASE.filter((i) => i.status === 'alerta').length
    const normais = MONITORAMENTO_BASE.filter((i) => i.status === 'normal').length
    const paradas = MONITORAMENTO_BASE.filter((i) => i.status === 'parada_operacional').length
    return { total, criticos, alertas, normais, paradas }
  }, [])

  return (
    <section className="alertas-industriais-page">
      <div className="pagina-cabecalho">
        <div>
          <h1 className="pagina-titulo">Alertas industriais</h1>
          <div className="pagina-meta">
            <span>{kpis.total} pontos monitorados</span>
            <span>{kpis.normais} em conformidade</span>
            <span>{kpis.criticos} crítico</span>
            <span>{kpis.alertas} fora da faixa</span>
            <span>{kpis.paradas} parada operacional</span>
          </div>
        </div>
        <div className="pagina-acoes">
          <span className={`chip ${kpis.criticos > 0 ? 'chip--danger' : 'chip--ok'}`}>
            {kpis.criticos > 0 ? 'intervenção requerida' : 'sem criticidade aberta'}
          </span>
        </div>
      </div>

      <div className="alertas-filtros">
        <div className="processos-tabs" aria-label="Filtrar por processo industrial">
          {PROCESSOS_INDUSTRIAIS.map((processo) => (
            <button
              key={processo.id}
              type="button"
              className={`processo-tab ${filtroProcesso === processo.id ? 'ativa' : ''}`}
              onClick={() => setFiltroProcesso(processo.id)}
              aria-pressed={filtroProcesso === processo.id}
              title={processo.descricao}
            >
              {processo.nome}
            </button>
          ))}
        </div>

        <div className="alertas-busca">
          <label className="search-field">
            <Search size={14} aria-hidden="true" />
            <input
              type="text"
              placeholder="Buscar indicador ou termo"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              aria-label="Buscar indicador"
            />
          </label>

          <label className="checkbox-filtro">
            <input
              type="checkbox"
              checked={apenasAlertas}
              onChange={(event) => setApenasAlertas(event.target.checked)}
            />
            <span>apenas anomalias</span>
          </label>
        </div>
      </div>

      <div className="monitoramento-grid">
        <div className="monitoramento-lista">
          {itensFiltrados.map((item) => {
            const ehSelecionado = itemSelecionado?.id === item.id
            const status = STATUS[item.status] ?? STATUS.normal

            return (
              <button
                key={item.id}
                type="button"
                className={`glass-card monitor-card ${STATUS[item.status]?.classe ?? ''} ${
                  ehSelecionado ? 'selecionado' : ''
                }`}
                onClick={() => setItemSelecionado(item)}
                aria-pressed={ehSelecionado}
              >
                <span className="monitor-card-header">
                  <span className="monitor-heading">
                    <span className="mini-label">{ROTULO_PROCESSO[item.processo]}</span>
                    <span className="monitor-titulo">{item.indicador}</span>
                  </span>
                  <span className="monitor-valor-box">
                    <strong>{item.valor}</strong>
                    <span>{item.unidade}</span>
                  </span>
                </span>

                <span className="monitor-detalhe">{item.detalhe}</span>

                <span className="monitor-card-footer">
                  <span className="monitor-status">{status.rotulo}</span>
                  <span className="monitor-faixa">faixa {item.faixaPadrao} {item.unidade}</span>
                  <time>{item.data}</time>
                </span>

                {item.acaoSugerida && (
                  <span className="monitor-acao">
                    <strong>ação sugerida:</strong> {item.acaoSugerida}
                  </span>
                )}
              </button>
            )
          })}

          {itensFiltrados.length === 0 && (
            <div className="indicator-state">
              <strong>Nenhum indicador encontrado para os filtros selecionados.</strong>
              <small>Tente alterar o processo industrial ou limpar a busca.</small>
            </div>
          )}
        </div>

        <aside className="glass-card monitor-aside">
          <div className="card-heading">
            <div>
              <span className="mini-label">fundamentação técnica</span>
              <h2>metodologia sucroenergética</h2>
            </div>
          </div>

          <div className="metodologia-bloco">
            <h4>Cadeia de qualidade da cana</h4>
            <p>
              O <strong>ATR (Açúcar Total Recuperável)</strong> quantifica a capacidade teórica da cana entregue gerar açúcar e etanol.
              As regras de cálculo obedecem estritamente às normas do Conselho dos Produtores de Cana-de-Açúcar, Açúcar e Álcool (Consecana).
            </p>
          </div>

          <div className="metodologia-bloco">
            <h4>Balanço de massa na moagem</h4>
            <p>
              A <strong>Pol do bagaço</strong> determina a perda direta de sacarose nos ternos. Embebição deficiente ou
              desgaste nos frisos das camisas de moenda elevam este índice, exigindo ajuste mecânico imediato.
            </p>
          </div>

          <div className="metodologia-bloco">
            <h4>Controle microbiológico</h4>
            <p>
              Bactérias láticas (ex: <em>Leuconostoc</em> e <em>Lactobacillus</em>) sintetizam dextrana e ácido lático a partir
              da sacarose, provocando queda drástica no rendimento fermentativo e incrustações em colunas de destilação.
            </p>
          </div>

          <div className="metodologia-bloco destaque">
            <h4>Tratamento de paradas operacionais</h4>
            <p>
              Dias de parada (por chuva, entressafra ou manutenção corretiva) <strong>não são misturados com períodos de moagem ativa</strong> nas médias ponderadas operacionais, preservando a fidelidade estatística da capacidade instalada.
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default AlertasIndustriaisPage
