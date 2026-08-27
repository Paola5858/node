function MenuLateral({ aberto }) {
  return (
    <aside className={`menu-lateral ${aberto ? 'aberto' : 'fechado'}`}>
      <h2 className="h6 text-uppercase mb-3">menuzinho básico</h2>
      <div className="d-grid gap-2">
        <button className="btn btn-menu text-start">início</button>
        <button className="btn btn-menu text-start">produtos</button>
        <button className="btn btn-menu text-start">relatórios</button>
        <button className="btn btn-menu text-start">configurações</button>
      </div>
    </aside>
  )
}

export default MenuLateral
