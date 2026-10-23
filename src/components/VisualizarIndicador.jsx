import React, { useState } from 'react'

function VisualizarIndicador({ indicador, onVoltar }) {
  const [documentoCarregado, setDocumentoCarregado] = useState(null)
  const url = indicador?.Url || ''
  const identidade = `${indicador?.Id ?? ''}:${url}`
  const carregando = documentoCarregado !== identidade
  let segura = false
  try { segura = ['http:', 'https:'].includes(new URL(url).protocol) } catch { segura = false }
  let linkPublicoPowerBi = false
  try {
    const destino = new URL(url)
    linkPublicoPowerBi = destino.hostname === 'app.powerbi.com' && destino.pathname === '/view' && destino.searchParams.has('r')
  } catch { /* URL inválida é tratada abaixo */ }

  if (!segura) {
    return (
      <section className="panel-viewer glass-card">
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
          <small>edite o indicador e informe um endereço http ou https.</small>
        </div>
      </section>
    )
  }

  return (
    <section className="panel-viewer glass-card">
      <div className="viewer-heading">
        <div>
          <span className="mini-label">painel selecionado</span>
          <h2>{indicador.Nome}</h2>
          <p>{indicador.Descricao}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setDocumentoCarregado(identidade)}
        />
      </div>

      <small className="viewer-note">
        o navegador informa apenas que o documento do iframe carregou; isso não confirma que o relatório está disponível. O conteúdo pode exigir autenticação, permissão ou configuração de incorporação compatível. Se não aparecer, abra o endereço em uma nova aba.
      </small>
      {linkPublicoPowerBi && <div className="error-feedback" role="note"><strong>atenção: link público do Power BI.</strong><span>O formato /view?r= corresponde a Publicar na Web. Qualquer pessoa na internet pode acessar o relatório sem autenticação; não use para dados confidenciais.</span></div>}
    </section>
  )
}

export default VisualizarIndicador
