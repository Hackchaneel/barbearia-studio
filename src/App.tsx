import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Footer, Header } from './components/Layout'
import { AuthProvider } from './auth/AuthContext'
import PrivatePanel from './auth/PrivatePanel'
import SignIn from './auth/SignIn'
import Home from './pages/Home'
import Services from './pages/Services'
import Booking from './pages/Booking'
import './styles.css'
function App(){return <AuthProvider><BrowserRouter><Header/><Routes><Route path="/" element={<Home/>}/><Route path="/servicos" element={<Services/>}/><Route path="/agendar" element={<Booking/>}/><Route path="/entrar" element={<SignIn/>}/><Route path="/painel" element={<PrivatePanel/>}/><Route path="*" element={<Home/>}/></Routes><Footer/></BrowserRouter></AuthProvider>}
export default App
