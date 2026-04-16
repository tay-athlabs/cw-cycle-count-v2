/**
 * AuthContext.jsx
 * Provides authentication state and actions throughout the app.
 * Currently uses BYPASS_AUTH mock — flip the flag in authService.js
 * when the Google client ID is ready.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  BYPASS_AUTH,
  MOCK_USER,
  decodeCredential,
  persistUser,
  getPersistedUser,
  clearPersistedUser,
} from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // On mount — restore persisted session or apply bypass
  useEffect(() => {
    if (BYPASS_AUTH) {
      setUser(MOCK_USER)
      setLoading(false)
      return
    }
    const persisted = getPersistedUser()
    if (persisted) setUser(persisted)
    setLoading(false)
  }, [])

  // Called by Google OAuth onSuccess callback
  const loginWithGoogle = useCallback((credentialResponse) => {
    try {
      setError(null)
      const decoded = decodeCredential(credentialResponse.credential)
      persistUser(decoded)
      setUser(decoded)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const logout = useCallback(() => {
    clearPersistedUser()
    setUser(null)
  }, [])

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    loginWithGoogle,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
