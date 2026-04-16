import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import NavBar from './components/NavBar'
import Toast from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Overview from './pages/Overview'
import SiteDetail from './pages/SiteDetail'
import SessionStart from './pages/SessionStart'
import CountSession from './pages/CountSession'
import Analytics from './pages/Analytics'
import History from './pages/History'
import SKUMaster from './pages/SKUMaster'

export default function App() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="app-root">
      {isAuthenticated && <NavBar />}
      <main className="app-main">
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/"                        element={<Home />} />
            <Route path="/overview"                element={<Overview />} />
            <Route path="/site/:siteId"            element={<SiteDetail />} />
            <Route path="/session/new"             element={<SessionStart />} />
            <Route path="/session/:sessionId"      element={<CountSession />} />
            <Route path="/analytics"               element={<Analytics />} />
            <Route path="/history"                 element={<History />} />
            <Route path="/sku-master"              element={<SKUMaster />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toast />
    </div>
  )
}
