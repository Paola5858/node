import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  baixarRelatorioImportacao,
  consultarLinhasImportacao,
  confirmarImportacao,
  consultarImportacao,
  criarLoteImportacao,
  gerarPreviaImportacao,
  listarQualidadeImportacao,
  obterOpcoesImportacao,
} from '../services/api'

const TIPOS_ENTIDADE = [
  ['measurements', 'Medições industriais'],
  ['loads', 'Cargas / pesagens'],
  ['quality_analyses', 'Amostras / análises de qualidade'],
]

const CAMPOS_POR_ENTIDADE = {
  measurements: [
    ['measured_at', 'Data/hora da medição', true],
    ['equipment', 'Equipamento', true],
    ['indicator', 'Indicador', true],
    ['value', 'Valor original', true],
    ['unit_of_measure', 'Unidade original', true],
    ['event_id', 'Identificador do evento', false],
    ['sync_status', 'Status de sincronização', false],
  ],
  loads: [
    ['external_reference', 'Identificador único da carga', true],
    ['weighed_at', 'Data/hora da pesagem', true],
    ['gross_weight', 'Peso bruto', true],
    ['tare_weight', 'Tara', true],
    ['supplier', 'Fornecedor', false],
    ['farm', 'Fazenda', false],
    ['plot', 'Talhão', false],
    ['front', 'Frente', false],
    ['sync_status', 'Status de sincronização', false],
  ],
  quality_analyses: [
    ['sample_code', 'Código da amostra', true],
    ['indicator', 'Indicador', true],
    ['measured_at', 'Data/hora da coleta', true],
    ['value', 'Resultado original', true],
    ['unit_of_measure', 'Unidade original', true],
    ['load_reference', 'Identificador da carga', false],
    ['method', 'Método analítico', false],
    ['sync_status', 'Status de sincronização', false],
  ],
}

const STATUS = {
  uploaded: 'arquivo recebido',
  previewed: 'prévia pronta',
  queued: 'na fila de processamento',
  processing: 'processando',
  processed: 'processado',
  failed: 'falha no processamento',
  quarantined: 'em quarentena',
  received: 'recebido',
}

function percentage(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(2)}%`
}

function ImportacaoExcelPage({ sessao }) {
  const [options, setOptions] = useState({ units: [], harvests: [], sources: [] })
  const [qualityHistory, setQualityHistory] = useState([])
  const [selectedQueue, setSelectedQueue] = useState('')
  const [queueRows, setQueueRows] = useState([])
  const [unitId, setUnitId] = useState(
    sessao?.unitIds?.length === 1 && sessao.unitIds[0] !== '*' ? String(sessao.unitIds[0]) : '',
  )
  const [entityType, setEntityType] = useState('measurements')
  const [harvestId, setHarvestId] = useState('')
  const [sourceName, setSourceName] = useState('portal-file-upload')
  const [customSource, setCustomSource] = useState('')
  const [file, setFile] = useState(null)
  const [batchId, setBatchId] = useState(null)
  const [batchStatus, setBatchStatus] = useState('')
  const [preview, setPreview] = useState(null)
  const [mapping, setMapping] = useState({})
  const [templateName, setTemplateName] = useState('')
  const [duplicate, setDuplicate] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([obterOpcoesImportacao(), listarQualidadeImportacao()])
      .then(([result, history]) => {
        if (!active) return
        setOptions(result)
        setQualityHistory(history)
        if (result.units.length === 1) setUnitId((current) => current || String(result.units[0].id))
        if (result.sources.length) setSourceName((current) => current === 'portal-file-upload' ? result.sources[0].name : current)
      })
      .catch((cause) => { if (active) setErrorMessage(cause.message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!batchId || !['queued', 'processing'].includes(batchStatus)) return undefined
    let active = true
    let timer
    const poll = async () => {
      try {
        const status = await consultarImportacao(batchId)
        if (!active) return
        setBatchStatus(status.status)
        setNotice(status.failure_message || '')
        if (status.status === 'processed') {
          setPreview((current) => ({ ...current, result: status }))
          const history = await listarQualidadeImportacao()
          if (active) setQualityHistory(history)
        }
        else if (['queued', 'processing'].includes(status.status)) timer = setTimeout(poll, 1800)
      } catch (cause) {
        if (active) {
          setErrorMessage(cause.message)
          timer = setTimeout(poll, 4000)
        }
      }
    }
    timer = setTimeout(poll, 900)
    return () => { active = false; clearTimeout(timer) }
  }, [batchId, batchStatus])

  const harvestOptions = useMemo(
    () => options.harvests.filter((harvest) => String(harvest.unitId) === String(unitId)),
    [options.harvests, unitId],
  )
  const canUpload = Boolean(file && unitId && harvestId && (sourceName !== '__new' || customSource.trim()))

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null
    setFile(selected)
    setBatchId(null)
    setBatchStatus('')
    setPreview(null)
    setMapping({})
    setDuplicate(null)
    setErrorMessage('')
    setNotice('')
    event.target.value = ''
  }

  async function loadPreview(id, sheetName = '') {
    setBusy(true)
    setErrorMessage('')
    try {
      const result = await gerarPreviaImportacao(id, sheetName)
      setPreview(result)
      setMapping(result.suggestedMapping)
      setBatchStatus('previewed')
      setNotice(`${result.totalRows} linha(s) encontradas. Revise as colunas antes de confirmar.`)
    } catch (cause) {
      setErrorMessage(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitFile(reprocessOf = undefined) {
    if (!canUpload) return
    setBusy(true)
    setErrorMessage('')
    setDuplicate(null)
    setNotice('Enviando e preservando o arquivo original...')
    try {
      const created = await criarLoteImportacao(file, {
        unitId: Number(unitId),
        harvestId: Number(harvestId),
        entityType,
        sourceName: sourceName === '__new' ? customSource.trim() : sourceName,
        ...(reprocessOf === undefined ? {} : { reprocessOf }),
      })
      setBatchId(created.id)
      setBatchStatus(created.status)
      setNotice(`Original preservado. Lote ${created.id}, versão ${created.version}.`)
      await loadPreview(created.id)
    } catch (cause) {
      if (cause.status === 409 && cause.data?.canReprocess) {
        setDuplicate(cause.data)
        setNotice('')
      } else {
        setErrorMessage(cause.message)
        setNotice('')
      }
    } finally {
      setBusy(false)
    }
  }

  async function confirmBatch() {
    if (!batchId || !preview || !mapping) return
    setBusy(true)
    setErrorMessage('')
    try {
      const result = await confirmarImportacao(batchId, { mapping, templateName })
      setBatchStatus(result.status)
      setNotice(result.message)
    } catch (cause) {
      setErrorMessage(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function downloadReport() {
    try {
      const blob = await baixarRelatorioImportacao(batchId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `importacao-${batchId}-erros.csv`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setErrorMessage(cause.message)
    }
  }

  async function openQueue(queue) {
    setSelectedQueue(queue)
    setErrorMessage('')
    try {
      const result = await consultarLinhasImportacao(batchId, queue)
      setQueueRows(result.rows)
    } catch (cause) {
      setErrorMessage(cause.message)
    }
  }

  function selectTemplate(value) {
    const selected = preview?.templates?.find((template) => String(template.id) === value)
    if (!selected) return
    setMapping(selected.mapping)
    if (selected.sheetName && selected.sheetName !== preview.selectedSheet) {
      loadPreview(batchId, selected.sheetName)
        .then(() => setMapping(selected.mapping))
    }
  }

  const result = preview?.result
  const metrics = result?.quality_metrics
  const campos = CAMPOS_POR_ENTIDADE[entityType]
  const mappingReady = campos.filter(([, , required]) => required)
    .every(([field]) => mapping[field] && preview?.headers?.includes(mapping[field]))

  return (
    <section className="importacao-excel-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" /> ingestão controlada / qualidade de dados</span>
          <h1>importação e <em>qualidade industrial.</em></h1>
          <p>Arquivamento imutável, prévia obrigatória, mapeamento reutilizável e validação no servidor antes da publicação.</p>
        </div>
        <div className="step-badge"><strong>ETL</strong><span>bruto → tratado<br />com rastreabilidade</span></div>
      </div>

      <div className="glass-card import-dropzone-card">
        <div className="card-heading">
          <div><span className="mini-label">1 · contexto do lote</span><h2>origem e escopo</h2></div>
        </div>
        <div className="abas-grid">
          <label>
            Tipo de dado
            <select value={entityType} onChange={(event) => {
              setEntityType(event.target.value)
              setBatchId(null)
              setBatchStatus('')
              setPreview(null)
              setMapping({})
              setDuplicate(null)
            }}>
              {TIPOS_ENTIDADE.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Usina
            <select value={unitId} onChange={(event) => { setUnitId(event.target.value); setHarvestId('') }} required>
              <option value="">Selecione uma usina</option>
              {options.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <label>
            Safra
            <select value={harvestId} onChange={(event) => setHarvestId(event.target.value)} required disabled={!unitId}>
              <option value="">Selecione uma safra</option>
              {harvestOptions.map((harvest) => <option key={harvest.id} value={harvest.id}>{harvest.name}</option>)}
            </select>
          </label>
          <label>
            Fonte
            <select value={sourceName} onChange={(event) => setSourceName(event.target.value)}>
              {!options.sources.some((source) => source.name === 'portal-file-upload') && <option value="portal-file-upload">Portal · arquivo manual</option>}
              {options.sources.map((source) => <option key={source.id} value={source.name}>{source.name}</option>)}
              <option value="__new">Cadastrar nova fonte...</option>
            </select>
          </label>
          {sourceName === '__new' && (
            <label>
              Nome da nova fonte
              <input value={customSource} onChange={(event) => setCustomSource(event.target.value)} maxLength={120} />
            </label>
          )}
        </div>

        <input ref={fileInput} type="file" accept=".csv,.xlsx" hidden onChange={chooseFile} />
        <div className="upload-box">
          <div className="upload-box-icon" aria-hidden="true">📊</div>
          <div>
            <h3>{file ? file.name : 'Selecione um arquivo CSV ou Excel (.xlsx)'}</h3>
            <p>Máximo de 9 MB. O original é preservado sem alterações; nada é processado antes da confirmação explícita.</p>
            {batchId && <p>Lote #{batchId} · {STATUS[batchStatus] || batchStatus}</p>}
            {notice && <p aria-live="polite">{notice}</p>}
            {errorMessage && <p role="alert" style={{ color: 'var(--danger)' }}>{errorMessage}</p>}
          </div>
          <button type="button" className="button-ghost" onClick={() => fileInput.current?.click()}>escolher arquivo</button>
        </div>
        <div className="card-heading" style={{ marginTop: 16 }}>
          <span>{file ? `Selecionado: ${file.name}` : 'O lote registra usuário, organização, usina, safra, fonte, horário e SHA-256.'}</span>
          <button type="button" className="button-primary" disabled={!canUpload || busy} onClick={() => submitFile()}>
            {busy ? 'aguarde...' : 'enviar e gerar prévia'}
          </button>
        </div>
        {duplicate && (
          <div className="regra-item regra-alerta" role="alert">
            <div>
              <strong>Arquivo já importado no lote #{duplicate.existingBatchId} (versão {duplicate.version ?? 'legada'}).</strong>
              <p>O mesmo SHA-256 não será reimportado silenciosamente. Confirme abaixo para criar uma nova versão do lote.</p>
              <button type="button" className="button-primary" disabled={busy} onClick={() => submitFile(duplicate.existingBatchId)}>
                reprocessar como nova versão
              </button>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="glass-card tabela-previa-card">
          <div className="card-heading">
            <div><span className="mini-label">2 · prévia obrigatória</span><h2>revise a aba e o mapeamento</h2></div>
            <span>{preview.totalRows} linha(s) · amostra de até 25</span>
          </div>
          {preview.sheets.length > 0 && (
            <label>
              Aba da planilha
              <select value={preview.selectedSheet} onChange={(event) => loadPreview(batchId, event.target.value)} disabled={busy}>
                {preview.sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
              </select>
            </label>
          )}
          {preview.templates?.length > 0 && (
            <label>
              Template salvo para esta fonte
              <select defaultValue="" onChange={(event) => selectTemplate(event.target.value)}>
                <option value="">Usar ou ajustar o mapeamento</option>
                {preview.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
          )}
          <div className="abas-grid">
            {campos.map(([field, label, required]) => (
              <label key={field}>
                {label}{required ? ' *' : ' (opcional)'}
                <select
                  value={mapping[field] || ''}
                  onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                >
                  <option value="">Não mapear</option>
                  {preview.headers.map((header) => <option key={`${field}-${header}`} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="tabela-scroll">
            <table className="dados-tabela">
              <thead><tr><th>Linha</th>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>#{row.rowNumber}</td>
                    {preview.headers.map((header) => <td key={header}>{String(row.values[header] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-heading" style={{ marginTop: 16 }}>
            <label>
              Nome do template reutilizável (opcional)
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={120} placeholder="Ex.: exportação LIMS diária" />
            </label>
            <button type="button" className="button-primary" disabled={!mappingReady || busy || batchStatus !== 'previewed'} onClick={confirmBatch}>
              confirmar e processar lote
            </button>
          </div>
          <p>Ao confirmar, o worker assíncrono classifica cada linha em uma única fila: Aceitos, Rejeitados, Suspeitos ou Pendentes.</p>
        </div>
      )}

      {metrics && (
        <>
          <div className="card-heading"><div><span className="mini-label">3 · qualidade multidimensional</span><h2>indicadores independentes (sem nota agregada)</h2></div></div>
          <div className="auditoria-summary-grid">
            <div className="metric-card"><span className="metric-label">completude</span><strong>{percentage(metrics.completeness.percent)}</strong><span className="metric-caption">{metrics.completeness.populatedRequiredCells}/{metrics.completeness.requiredCells} campos obrigatórios</span></div>
            <div className="metric-card"><span className="metric-label">atualidade média</span><strong>{metrics.freshness.averageDelaySeconds == null ? '—' : `${(metrics.freshness.averageDelaySeconds / 60).toFixed(1)} min`}</strong><span className="metric-caption">atraso medição → recebimento</span></div>
            <div className="metric-card"><span className="metric-label">duplicidade</span><strong>{percentage(metrics.duplication.percent)}</strong><span className="metric-caption">{metrics.duplication.duplicateRows} linha(s) duplicada(s)</span></div>
            <div className="metric-card"><span className="metric-label">integridade referencial</span><strong>{percentage(metrics.referentialIntegrity.percent)}</strong><span className="metric-caption">{metrics.referentialIntegrity.resolvedRows}/{metrics.referentialIntegrity.totalRows} linhas resolvidas</span></div>
            <div className="metric-card"><span className="metric-label">unidades reconhecidas</span><strong>{percentage(metrics.recognizedUnits.percent)}</strong><span className="metric-caption">{metrics.recognizedUnits.recognizedRows}/{metrics.recognizedUnits.unitRows} unidades</span></div>
            <div className="metric-card"><span className="metric-label">conciliação entre fontes</span><strong>{percentage(metrics.sourceReconciliation.percent)}</strong><span className="metric-caption">{metrics.sourceReconciliation.checkedRows} comparação(ões)</span></div>
            <div className="metric-card"><span className="metric-label">cobertura de indicadores</span><strong>{metrics.indicatorCoverage.distinctIndicators}</strong><span className="metric-caption">{Object.entries(metrics.indicatorCoverage.counts).map(([name, count]) => `${name}: ${count}`).join(' · ') || 'nenhum indicador resolvido'}</span></div>
          </div>
          <div className="glass-card">
            <h2>filas do lote</h2>
            <div className="abas-grid">
              {['Aceitos', 'Rejeitados', 'Suspeitos', 'Pendentes'].map((queue) => (
                <button type="button" className="metric-card" key={queue} onClick={() => openQueue(queue)}>
                  <span className="metric-label">{queue}</span><strong>{metrics.queues[queue] || 0}</strong>
                </button>
              ))}
            </div>
            <button type="button" className="button-ghost" onClick={downloadReport}>baixar CSV de erros e suspeitos</button>
          </div>
        </>
      )}
      {selectedQueue && (
        <div className="glass-card">
          <h2>revisão da fila: {selectedQueue}</h2>
          {queueRows.length === 0 && <p>Nenhuma linha nesta fila.</p>}
          {queueRows.map((row) => (
            <details key={row.sourceRowNumber}>
              <summary>Linha {row.sourceRowNumber} · {row.queue}</summary>
              <p>{row.issues.map((issue) => issue.message).join(' · ') || 'Sem inconsistências identificadas.'}</p>
              <pre>{JSON.stringify(row.raw, null, 2)}</pre>
            </details>
          ))}
        </div>
      )}
      <div className="glass-card">
        <h2>histórico de qualidade compartilhado com o dashboard</h2>
        <div className="tabela-scroll">
          <table className="dados-tabela">
            <thead><tr><th>Lote</th><th>Status</th><th>Recebidas</th><th>Aceitos</th><th>Rejeitados</th><th>Suspeitos</th><th>Pendentes</th></tr></thead>
            <tbody>
              {qualityHistory.map((entry) => (
                <tr key={entry.id}>
                  <td>#{entry.id} · {entry.original_filename}</td>
                  <td>{STATUS[entry.status] || entry.status}</td>
                  <td>{entry.receivedCount}</td>
                  <td>{entry.acceptedCount}</td>
                  <td>{entry.rejectedCount}</td>
                  <td>{entry.suspectCount}</td>
                  <td>{entry.pendingCount}</td>
                </tr>
              ))}
              {!qualityHistory.length && <tr><td colSpan="7">Nenhum lote processado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default ImportacaoExcelPage
