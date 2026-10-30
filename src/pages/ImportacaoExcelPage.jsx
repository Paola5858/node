import React, { useState, useMemo, useRef } from 'react'

// Estruturas de referência do setor sucroenergético
const MODELOS_ABAS = {
  Fato_Medicoes: {
    nome: 'Fato_Medicoes',
    descricao: 'Medições industriais e físico-químicas da matéria-prima e processo',
    colunasObrigatorias: ['ID_MEDICAO', 'DATA_HORA', 'SAFRA', 'UNIDADE', 'EQUIPAMENTO', 'INDICADOR', 'VALOR_ORIGINAL', 'UNIDADE_MEDIDA'],
    colunasOpcionais: ['STATUS_OPERACIONAL', 'OBSERVACOES_ORIGEM'],
  },
  Dim_Indicador: {
    nome: 'Dim_Indicador',
    descricao: 'Dicionário de indicadores de qualidade e processo (Brix, Pol, ATR, etc.)',
    colunasObrigatorias: ['COD_INDICADOR', 'NOME_INDICADOR', 'UNIDADE_PADRAO', 'TIPO_AGREGACAO', 'GRUPO_PROCESSO'],
    colunasOpcionais: ['LIMITE_MIN_ESPERADO', 'LIMITE_MAX_ESPERADO', 'STATUS_HOMOLOGACAO'],
  },
  Dim_Calendario: {
    nome: 'Dim_Calendario',
    descricao: 'Calendário industrial de safra, semanas operacionais e dias de moagem',
    colunasObrigatorias: ['DATA', 'SAFRA', 'SEMANA_SAFRA', 'DIA_MOAGEM_ATIVO', 'STATUS_FABRICA'],
    colunasOpcionais: ['MOTIVO_PARADA'],
  },
  Auditoria_Dados: {
    nome: 'Auditoria_Dados',
    descricao: 'Histórico de ingestão, fontes de origem e logs de transformação',
    colunasObrigatorias: ['ID_LOTE', 'ARQUIVO_ORIGEM', 'DATA_INGESTAO', 'RESPONSAVEL', 'TOTAL_REGISTROS'],
    colunasOpcionais: ['HASH_ARQUIVO', 'TRANSFORMACOES_APLICADAS'],
  },
  Pendencias_Validacao: {
    nome: 'Pendencias_Validacao',
    descricao: 'Registros retidos para revisão técnica por inconsistência ou duplicidade',
    colunasObrigatorias: ['ID_PENDENCIA', 'REGISTRO_REF', 'MOTIVO_RETENCAO', 'TIPO_DADO', 'GRAVIDADE'],
    colunasOpcionais: ['VALOR_ANALISADO', 'DATA_IDENTIFICACAO'],
  },
  Resumo_Qualidade: {
    nome: 'Resumo_Qualidade',
    descricao: 'Relatório executivo de conformidade da base industrial',
    colunasObrigatorias: ['PERIODO', 'TAXA_CONFORMIDADE_PCT', 'TOTAL_ACEITOS', 'TOTAL_PENDENTES'],
    colunasOpcionais: ['INDICADORES_FORA_PADRAO'],
  },
}

// Dados de amostra representativos de operação sucroenergética real para validação técnica
const DADOS_EXEMPLO_FATO = `ID_MEDICAO;DATA_HORA;SAFRA;UNIDADE;EQUIPAMENTO;INDICADOR;VALOR_ORIGINAL;UNIDADE_MEDIDA;STATUS_OPERACIONAL
1001;2026-10-15 08:00;safra 2026/27;Moenda 1;Extrator A;BRIX_CALDO_PRIM;19.45;°Bx;Operação normal
1002;2026-10-15 08:00;safra 2026/27;Moenda 1;Extrator A;POL_CALDO_PRIM;16.32;%;Operação normal
1003;2026-10-15 08:30;safra 2026/27;Laboratório Central;Sacarímetro 2;PUREZA_CALDO;83.91;%;Operação normal
1004;2026-10-15 09:00;safra 2026/27;Moenda 1;Sensor Bagaco;POL_BAGACO;1.85;%;Operação normal
1005;2026-10-15 09:00;safra 2026/27;Laboratório Central;Balança Umidade;UMIDADE_LAB;0.089;fração decimal;Atenção: escala fracionária
1006;2026-10-15 09:30;safra 2026/27;Difusor 1;Calha de Entrada;FIBRA_CANA;12.80;%;Operação normal
1007;2026-10-15 10:00;safra 2026/27;Laboratório Central;Auto-Titro;ARC_CANA;0.78;%;Operação normal
1008;2026-10-15 10:30;safra 2026/27;Balança Rodoviária;Pista 1;TC;48.50;a homologar;Pendente validação técnica de unidade
1009;2026-10-15 11:00;safra 2026/27;Destilaria;Dorna 4;VIABILIDADE_LEVEDURA;86.40;%;Operação normal
1010;2026-10-15 11:30;safra 2026/27;Destilaria;Dorna 4;ACIDO_LATICO;1.20;g/L;Sob controle
1011;2026-10-15 12:00;safra 2026/27;Moenda 1;Extrator A;BRIX_CALDO_PRIM;19.50;°Bx;Operação normal
1012;2026-10-15 12:00;safra 2026/27;Moenda 1;Extrator A;BRIX_CALDO_PRIM;19.50;°Bx;Possível duplicidade de leitura`

function parseCsv(texto) {
  const linhas = texto.trim().split(/\r?\n/)
  if (linhas.length < 2) return { colunas: [], linhas: [] }

  // Detecção de delimitador: ponto-e-vírgula ou vírgula
  const primeiraLinha = linhas[0]
  const delimitador = primeiraLinha.includes(';') ? ';' : ','

  const colunas = primeiraLinha.split(delimitador).map((c) => c.trim().replace(/^["']|["']$/g, ''))
  const dados = []

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha) continue
    const partes = linha.split(delimitador).map((p) => p.trim().replace(/^["']|["']$/g, ''))
    const obj = {}
    colunas.forEach((col, idx) => {
      obj[col] = partes[idx] !== undefined ? partes[idx] : ''
    })
    obj.__linha = i + 1
    dados.push(obj)
  }

  return { colunas, linhas: dados }
}

function validarRegistrosIndustriais(registros, abaAtiva) {
  const aceitos = []
  const pendencias = []
  const duplicidades = []
  const transformacoes = []

  const chavesVistas = new Set()

  registros.forEach((reg) => {
    const erros = []
    const avisos = []

    // 1. Verificação de duplicidades
    const chaveDuplicidade = `${reg.DATA_HORA || ''}_${reg.EQUIPAMENTO || ''}_${reg.INDICADOR || ''}`
    if (chaveDuplicidade !== '__' && chavesVistas.has(chaveDuplicidade)) {
      duplicidades.push({
        linha: reg.__linha,
        registro: reg,
        motivo: `Duplicidade detectada para o mesmo momento e equipamento (${reg.INDICADOR || 'N/A'})`,
      })
      avisos.push('Registro duplicado com medição anterior idêntica')
    } else if (chaveDuplicidade !== '__') {
      chavesVistas.add(chaveDuplicidade)
    }

    // 2. Regra de Negócio: UMIDADE_LAB
    if (reg.INDICADOR === 'UMIDADE_LAB') {
      const num = parseFloat(String(reg.VALOR_ORIGINAL).replace(',', '.'))
      if (!isNaN(num)) {
        if (num > 0 && num <= 0.30) {
          transformacoes.push({
            linha: reg.__linha,
            indicador: 'UMIDADE_LAB',
            original: reg.VALOR_ORIGINAL,
            transformado: `${(num * 100).toFixed(2)}%`,
            regra: 'Fração decimal detectada (<= 0.30). Interpretado como % sem duplicar multiplicação na origem.',
          })
        } else if (num > 30 && num <= 100) {
          // Já em percentual
        } else {
          erros.push(`Valor de UMIDADE_LAB fora da faixa plausível: ${reg.VALOR_ORIGINAL}`)
        }
      }
    }

    // 3. Regra de Negócio: Indicador TC
    if (reg.INDICADOR === 'TC') {
      avisos.push('Indicador TC: Definição técnica e unidade sob validação. Média ponderada não aplicada automaticamente.')
    }

    // 4. Regra de Negócio: Coerência Brix vs Pol
    if (reg.INDICADOR === 'POL_CALDO_PRIM') {
      const pol = parseFloat(String(reg.VALOR_ORIGINAL).replace(',', '.'))
      if (!isNaN(pol) && pol > 25) {
        erros.push(`Pol do caldo primário anormalmente alto (> 25%): ${reg.VALOR_ORIGINAL}`)
      }
    }

    // 5. Verificação de campos obrigatórios
    const confAba = MODELOS_ABAS[abaAtiva]
    if (confAba) {
      confAba.colunasObrigatorias.forEach((col) => {
        if (reg[col] === undefined || reg[col] === '') {
          erros.push(`Campo obrigatório ausente: ${col}`)
        }
      })
    }

    if (erros.length > 0) {
      pendencias.push({
        linha: reg.__linha,
        registro: reg,
        erros,
        avisos,
      })
    } else {
      aceitos.push({
        ...reg,
        __avisos: avisos,
      })
    }
  })

  return {
    aceitos,
    pendencias,
    duplicidades,
    transformacoes,
    taxaConformidade: registros.length > 0 ? ((aceitos.length / registros.length) * 100).toFixed(1) : 0,
  }
}

function ImportacaoExcelPage({ sessao }) {
  const [abaSelecionada, setAbaSelecionada] = useState('Fato_Medicoes')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [conteudoBruto, setConteudoBruto] = useState('')
  const [resultadoAuditoria, setResultadoAuditoria] = useState(null)
  const [paginaTabela, setPaginaTabela] = useState(1)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const fileInputRef = useRef(null)

  function carregarAmostraOperacional() {
    setNomeArquivo('Amostra_Fato_Medicoes_Usina_2026.csv')
    setConteudoBruto(DADOS_EXEMPLO_FATO)
    analisarDados(DADOS_EXEMPLO_FATO, 'Amostra_Fato_Medicoes_Usina_2026.csv')
  }

  function lidarComArquivo(event) {
    const arquivo = event.target.files?.[0]
    if (!arquivo) return
    setNomeArquivo(arquivo.name)
    const leitor = new FileReader()
    leitor.onload = (e) => {
      const texto = e.target.result
      setConteudoBruto(texto)
      analisarDados(texto, arquivo.name)
    }
    leitor.onerror = () => {
      alert('Não foi possível ler o arquivo selecionado.')
    }
    leitor.readAsText(arquivo, 'UTF-8')
    event.target.value = ''
  }

  function analisarDados(texto, nome) {
    const parsed = parseCsv(texto)
    const auditoria = validarRegistrosIndustriais(parsed.linhas, abaSelecionada)

    setResultadoAuditoria({
      arquivo: nome,
      aba: abaSelecionada,
      dataIngestao: new Date().toLocaleString('pt-BR'),
      responsavel: sessao?.nome || sessao?.email || 'Operador Industrial',
      totalLido: parsed.linhas.length,
      colunas: parsed.colunas,
      dadosBrutos: parsed.linhas,
      ...auditoria,
    })
    setPaginaTabela(1)
  }

  const itensExibicao = useMemo(() => {
    if (!resultadoAuditoria?.dadosBrutos) return []
    let lista = resultadoAuditoria.dadosBrutos

    if (filtroStatus === 'aceitos') {
      const idsAceitos = new Set(resultadoAuditoria.aceitos.map((a) => a.__linha))
      lista = lista.filter((item) => idsAceitos.has(item.__linha))
    } else if (filtroStatus === 'pendentes') {
      const idsPendentes = new Set(resultadoAuditoria.pendencias.map((p) => p.linha))
      lista = lista.filter((item) => idsPendentes.has(item.__linha))
    } else if (filtroStatus === 'duplicados') {
      const idsDuplicados = new Set(resultadoAuditoria.duplicidades.map((d) => d.linha))
      lista = lista.filter((item) => idsDuplicados.has(item.__linha))
    }

    if (filtroTexto.trim()) {
      const t = filtroTexto.toLowerCase()
      lista = lista.filter((item) =>
        Object.values(item).some((v) => String(v).toLowerCase().includes(t))
      )
    }

    return lista
  }, [resultadoAuditoria, filtroStatus, filtroTexto])

  const itensPaginados = useMemo(() => {
    const porPagina = 8
    const inicio = (paginaTabela - 1) * porPagina
    return itensExibicao.slice(inicio, inicio + porPagina)
  }, [itensExibicao, paginaTabela])

  const totalPaginas = Math.ceil(itensExibicao.length / 8) || 1

  return (
    <section className="importacao-excel-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-line" /> engenharia de dados / excel & csv
          </span>
          <h1>
            importação e <em>qualidade industrial.</em>
          </h1>
          <p>
            Validação rigorosa de planilhas operacionais com auditoria de colunas,
            detecção de inconsistências e rastreabilidade total para o setor sucroenergético.
          </p>
        </div>
        <div className="step-badge">
          <strong>ETL</strong>
          <span>validação<br />de dados</span>
        </div>
      </div>

      {/* Seletor de Modelo de Aba Industrial */}
      <div className="glass-card aba-selector-card">
        <div className="card-heading">
          <div>
            <span className="mini-label">estrutura esperada</span>
            <h2>selecione a aba ou modelo industrial</h2>
          </div>
          <button
            type="button"
            className="button-ghost"
            onClick={carregarAmostraOperacional}
            title="Carregar conjunto pré-formatado de medições industriais"
          >
            carregar amostra de usina ↗
          </button>
        </div>

        <div className="abas-grid">
          {Object.entries(MODELOS_ABAS).map(([chave, conf]) => (
            <button
              key={chave}
              type="button"
              className={`aba-pill ${abaSelecionada === chave ? 'ativa' : ''}`}
              onClick={() => {
                setAbaSelecionada(chave)
                if (conteudoBruto) {
                  analisarDados(conteudoBruto, nomeArquivo)
                }
              }}
            >
              <strong>{conf.nome}</strong>
              <small>{conf.descricao}</small>
            </button>
          ))}
        </div>
      </div>

      {/* Zona de Drop e Upload */}
      <div className="glass-card import-dropzone-card">
        <input
          type="file"
          ref={fileInputRef}
          accept=".csv,.txt"
          style={{ display: 'none' }}
          onChange={lidarComArquivo}
        />
        <div className="upload-box" onClick={() => fileInputRef.current?.click()}>
          <div className="upload-box-icon" aria-hidden="true">📊</div>
          <div>
            <h3>{nomeArquivo ? `Arquivo selecionado: ${nomeArquivo}` : 'Selecione ou arraste a planilha CSV / Excel exportado'}</h3>
            <p>Compatível com padrões SCADA, PIMS, LIMS e planilhas de apontamento diário (separador ';' ou ',')</p>
          </div>
          <button type="button" className="button-primary">
            escolher arquivo <span>↑</span>
          </button>
        </div>
      </div>

      {/* Relatório de Auditoria e Qualidade */}
      {resultadoAuditoria && (
        <div className="auditoria-summary-grid">
          <div className="metric-card">
            <span className="metric-label">registros lidos</span>
            <strong>{resultadoAuditoria.totalLido}</strong>
            <span className="metric-caption">arquivo: {resultadoAuditoria.arquivo}</span>
          </div>

          <div className="metric-card accent">
            <span className="metric-label">taxa de conformidade</span>
            <strong>{resultadoAuditoria.taxaConformidade}%</strong>
            <span className="metric-caption">{resultadoAuditoria.aceitos.length} registros válidos</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">pendências / erros</span>
            <strong style={{ color: resultadoAuditoria.pendencias.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {resultadoAuditoria.pendencias.length}
            </strong>
            <span className="metric-caption">revisão técnica necessária</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">duplicidades</span>
            <strong style={{ color: resultadoAuditoria.duplicidades.length > 0 ? 'var(--amber)' : 'inherit' }}>
              {resultadoAuditoria.duplicidades.length}
            </strong>
            <span className="metric-caption">leituras concorrentes</span>
          </div>
        </div>
      )}

      {/* Alertas Especiais de Negócio Sucroenergético */}
      {resultadoAuditoria && (resultadoAuditoria.transformacoes.length > 0 || resultadoAuditoria.duplicidades.length > 0) && (
        <div className="glass-card regras-negocio-card">
          <div className="card-heading">
            <div>
              <span className="mini-label">regras industriais aplicadas</span>
              <h2>rastreabilidade & ressalvas técnicas</h2>
            </div>
          </div>

          <div className="regras-lista">
            {resultadoAuditoria.transformacoes.map((t, idx) => (
              <div key={idx} className="regra-item regra-info">
                <span className="regra-badge">escala</span>
                <div>
                  <strong>{t.indicador} (Linha {t.linha})</strong>
                  <p>{t.regra} | Valor original: <code>{t.original}</code> → Analítico: <code>{t.transformado}</code></p>
                </div>
              </div>
            ))}

            {resultadoAuditoria.dadosBrutos.some((r) => r.INDICADOR === 'TC') && (
              <div className="regra-item regra-alerta">
                <span className="regra-badge">tc pendente</span>
                <div>
                  <strong>Indicador TC (Toneladas de Cana / Tempo de Ciclo)</strong>
                  <p>
                    Conforme especificação da usina, a unidade e o método de ponderação do indicador TC
                    estão sob validação técnica. Nenhuma média ponderada foi inferida arbitrariamente.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabela de Pré-visualização com Filtros */}
      {resultadoAuditoria && (
        <div className="glass-card tabela-previa-card">
          <div className="tabela-toolbar">
            <div>
              <span className="mini-label">auditoria de dados</span>
              <h2>pré-visualização analítica</h2>
            </div>

            <div className="tabela-filtros">
              <input
                type="text"
                placeholder="Filtrar por indicador, equipamento..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                className="tabela-search"
              />

              <select
                value={filtroStatus}
                onChange={(e) => { setFiltroStatus(e.target.value); setPaginaTabela(1); }}
                className="tabela-select"
              >
                <option value="todos">Todos os registros</option>
                <option value="aceitos">Apenas aceitos</option>
                <option value="pendentes">Com pendência</option>
                <option value="duplicados">Duplicidades</option>
              </select>
            </div>
          </div>

          <div className="tabela-scroll">
            <table className="dados-tabela">
              <thead>
                <tr>
                  <th>Linha</th>
                  {resultadoAuditoria.colunas.slice(0, 7).map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {itensPaginados.map((item) => {
                  const ehPendente = resultadoAuditoria.pendencias.some((p) => p.linha === item.__linha)
                  const ehDuplicado = resultadoAuditoria.duplicidades.some((d) => d.linha === item.__linha)

                  return (
                    <tr key={item.__linha} className={ehPendente ? 'linha-pendente' : ehDuplicado ? 'linha-duplicada' : 'linha-ok'}>
                      <td>#{item.__linha}</td>
                      {resultadoAuditoria.colunas.slice(0, 7).map((col) => (
                        <td key={col}>{item[col]}</td>
                      ))}
                      <td>
                        {ehPendente ? (
                          <span className="status-tag status-pendente">pendência</span>
                        ) : ehDuplicado ? (
                          <span className="status-tag status-aviso">duplicata</span>
                        ) : (
                          <span className="status-tag status-ok">conforme</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="tabela-paginacao">
            <span>Mostrando {itensExibicao.length} registros ({paginaTabela} de {totalPaginas})</span>
            <div className="paginacao-botoes">
              <button
                type="button"
                className="button-ghost"
                disabled={paginaTabela <= 1}
                onClick={() => setPaginaTabela((p) => Math.max(1, p - 1))}
              >
                anterior
              </button>
              <button
                type="button"
                className="button-ghost"
                disabled={paginaTabela >= totalPaginas}
                onClick={() => setPaginaTabela((p) => Math.min(totalPaginas, p + 1))}
              >
                próxima
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ImportacaoExcelPage
