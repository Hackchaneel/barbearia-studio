import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Footer, Header } from './components/Layout'
import Home from './pages/Home'
import Services from './pages/Services'
import Booking from './pages/Booking'
import './styles.css'
function App(){return <BrowserRouter><Header/><Routes><Route path="/" element={<Home/>}/><Route path="/servicos" element={<Services/>}/><Route path="/agendar" element={<Booking/>}/><Route path="*" element={<Home/>}/></Routes><Footer/></BrowserRouter>}
export default App
