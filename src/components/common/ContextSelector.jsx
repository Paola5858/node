function ContextSelector({ safras, safraAtual, onChange }) {
  return (
    <label className="context-selector">
      <span className="mini-label">safra em contexto</span>
      <select value={safraAtual.id} onChange={(event) => onChange(event.target.value)} aria-label="Safra em contexto">
        {safras.map((safra) => <option key={safra.id} value={safra.id}>{safra.nome}</option>)}
        <option value="todas">todas as safras</option>
      </select>
    </label>
  )
}

export default ContextSelector