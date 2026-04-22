/**
 * authService.js
 * ─────────────────────────────────────────────────────────────────
 * Google OAuth helpers.
 * Auth is currently bypassed — mock users are available for testing.
 * To enable real auth: set VITE_GOOGLE_CLIENT_ID in .env
 * and set BYPASS_AUTH to false.
 * ─────────────────────────────────────────────────────────────────
 */

import { jwtDecode } from 'jwt-decode'

export const BYPASS_AUTH = true // ← set to false when client ID is ready

export const ALLOWED_DOMAIN = 'coreweave.com'

export const MOCK_USERS = [
  {
    email: 'j.bakker@coreweave.com',
    name: 'J. Bakker',
    picture: null,
    given_name: 'J.',
    family_name: 'Bakker',
    role: 'manager',
  },
  {
    email: 'a.smith@coreweave.com',
    name: 'A. Smith',
    picture: null,
    given_name: 'Alex',
    family_name: 'Smith',
    role: 'ics',
  },
  {
    email: 'm.jones@coreweave.com',
    name: 'M. Jones',
    picture: null,
    given_name: 'Morgan',
    family_name: 'Jones',
    role: 'ics',
  },
]

// Default mock user (first in list)
export const MOCK_USER = MOCK_USERS[0]

export function decodeCredential(credential) {
  const user = jwtDecode(credential)
  const domain = user.email?.split('@')[1]
  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`Access restricted to @${ALLOWED_DOMAIN} accounts`)
  }
  return {
    email:       user.email,
    name:        user.name,
    picture:     user.picture,
    given_name:  user.given_name,
    family_name: user.family_name,
    role:        'ics',
  }
}

export function persistUser(user) {
  sessionStorage.setItem('cw_user', JSON.stringify(user))
}

export function getPersistedUser() {
  try {
    const raw = sessionStorage.getItem('cw_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearPersistedUser() {
  sessionStorage.removeItem('cw_user')
}

export function isManager(user) {
  return user?.role === 'manager' || user?.role === 'admin'
}

export function isAdmin(user) {
  return user?.role === 'admin'
}
