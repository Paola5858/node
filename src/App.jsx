import { useState } from 'react'
import Header from './components/Header'
import MenuLateral from './components/MenuLateral'
import Conteudo from './components/Conteudo'
import './App.css'

function App() {
  const [menuAberto, setMenuAberto] = useState(true)

  function alterarMenu() {
    setMenuAberto(!menuAberto)
  }

  return (
    <>
      <Header />
      <div className="layout">
        <MenuLateral aberto={menuAberto} />
        <main className="area-conteudo">
          <div className="p-3 border-bottom bg-white">
            <button className="btn btn-primary" onClick={alterarMenu}>
              ☰ menu
            </button>
          </div>
          <Conteudo />
        </main>
      </div>
    </>
  )
}

export default App
