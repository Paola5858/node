import React, { useRef, useState } from 'react'

function urlPowerBiValida(value) {
  try {
    const url = new URL(value)
    const guid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i
    const publicToken = url.searchParams.get('r') || ''
    const publicLink = url.pathname === '/view' && /^[A-Za-z\d_-]{20,2048}$/.test(publicToken)
    const reportEmbed = url.pathname === '/reportEmbed' &&
      guid.test(url.searchParams.get('reportId') || '') && guid.test(url.searchParams.get('ctid') || '')
    return url.protocol === 'https:' && url.hostname === 'app.powerbi.com' && (publicLink || reportEmbed)
  } catch { return false }
}

function VisualizarIndicador({ indicador, onVoltar }) {
  const [documentoCarregado, setDocumentoCarregado] = useState(null)
  const [foco, setFoco] = useState(false)
  const viewerRef = useRef(null)
  const url = indicador?.Url || ''
  const identidade = `${indicador?.Id ?? ''}:${url}`
  const carregando = documentoCarregado !== identidade
  const segura = urlPowerBiValida(url)

  if (!segura) {
    return (
      <section className={`panel-viewer glass-card ${foco ? 'focus-mode' : ''}`} ref={viewerRef}>
        <div className="viewer-heading">
          <div>
            <span className="mini-label">painel selecionado</span>
            <h2>{indicador?.Nome || 'Indicador'}</h2>
          </div>
          {onVoltar && (
            <button className="button-ghost" type="button" onClick={onVoltar}>
              voltar para a lista
            </button>
          )}
        </div>
        <div className="viewer-state">
          <strong>URL de painel inválida.</strong>
          <small>edite o indicador e informe um link público ou endereço reportEmbed válido do Power BI.</small>
        </div>
      </section>
    )
  }

  return (
    <section className={`panel-viewer glass-card ${foco ? 'focus-mode' : ''}`} ref={viewerRef}>
      <div className="viewer-heading">
        <div>
          <span className="mini-label">painel selecionado</span>
          <h2>{indicador.Nome}</h2>
          <p>{indicador.Descricao}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="button-ghost" type="button" onClick={() => setFoco((ativo) => !ativo)} aria-pressed={foco}>
            {foco ? 'sair do modo de foco' : 'modo de foco'}
          </button>
          <button className="button-ghost" type="button" onClick={() => viewerRef.current?.requestFullscreen?.()} disabled={!document.fullscreenEnabled}>
            tela cheia
          </button>
          {onVoltar && (
            <button className="button-ghost" type="button" onClick={onVoltar}>
              voltar para a lista
            </button>
          )}
          <a className="button-ghost" href={url} target="_blank" rel="noreferrer">
            abrir em nova aba <span>↗</span>
          </a>
        </div>
      </div>

      <div className="viewer-frame">
        {carregando && (
          <div className="viewer-loading">
            <span className="loading-bar" />
            <strong role="status">aguardando o documento do painel...</strong>
          </div>
        )}
        <iframe
          key={identidade}
          title={`Painel ${indicador.Nome}`}
          src={url}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          allow="fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setDocumentoCarregado(identidade)}
        />
      </div>

      <small className="viewer-note">
        o navegador informa apenas que o documento do iframe carregou; isso não confirma que o relatório está disponível. O conteúdo pode exigir autenticação, permissão ou configuração de incorporação compatível. Se não aparecer, abra o endereço em uma nova aba.
      </small>
    </section>
  )
}

export default VisualizarIndicador
