import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Footer, Header } from './components/Layout'
import { AuthProvider } from './auth/AuthContext'
import './styles.css'

const PrivatePanel = lazy(() => import('./auth/PrivatePanel'))
const SignIn = lazy(() => import('./auth/SignIn'))
const Home = lazy(() => import('./pages/Home'))
const Services = lazy(() => import('./pages/Services'))
const Booking = lazy(() => import('./pages/Booking'))

function App() {
  return <AuthProvider><BrowserRouter><Header/><Suspense fallback={<main id="conteudo" className="inner-page"><div className="container admin-loading">Carregando página…</div></main>}><Routes>
    <Route path="/" element={<Home/>}/>
    <Route path="/servicos" element={<Services/>}/>
    <Route path="/agendar" element={<Booking/>}/>
    <Route path="/entrar" element={<SignIn/>}/>
    <Route path="/painel" element={<PrivatePanel/>}/>
    <Route path="*" element={<Home/>}/>
  </Routes></Suspense><Footer/></BrowserRouter></AuthProvider>
}

export default App
