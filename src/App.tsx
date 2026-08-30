import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Home } from './components/home/Home';
import { Header } from './components/header/Header';
import { Footer } from './components/footer/Footer';
import './App.css';


function App() {
  return (
    <Router>
      <div className="layout-container">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;