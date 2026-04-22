/**
 * AuthContext.jsx
 * Provides authentication state and actions throughout the app.
 * Supports mock user switching for testing multi-user flows.
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
      const persisted = getPersistedUser()
      if (persisted) {
        setUser(persisted)
      }
      // Don't auto-login — show the user picker
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
      if (BYPASS_AUTH) {
        persistUser(MOCK_USER)
        setUser(MOCK_USER)
        return
      }
      const decoded = decodeCredential(credentialResponse.credential)
      persistUser(decoded)
      setUser(decoded)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  // Login as a specific mock user (for testing)
  const loginAsMockUser = useCallback((mockUser) => {
    persistUser(mockUser)
    setUser(mockUser)
  }, [])

  const logout = useCallback(() => {
    clearPersistedUser()
    setUser(null)
  }, [])

  // Update user role (for testing and admin role management)
  const updateRole = useCallback((newRole) => {
    setUser(prev => {
      const updated = { ...prev, role: newRole }
      persistUser(updated)
      return updated
    })
  }, [])

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    loginWithGoogle,
    loginAsMockUser,
    logout,
    updateRole,
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
