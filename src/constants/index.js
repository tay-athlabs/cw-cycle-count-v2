/**
 * constants/index.js
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for all app-wide constants.
 * Every magic string, color mapping, and configuration value
 * lives here. Components import from this file — never hardcode.
 * ─────────────────────────────────────────────────────────────────
 */

// ── SESSION STATUSES ──────────────────────────────────────────────

export const SESSION_STATUS = {
  SCHEDULED: 'scheduled',
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

export const ACTIVE_STATUSES = [SESSION_STATUS.OPEN, SESSION_STATUS.IN_PROGRESS]
export const EDITABLE_STATUSES = [SESSION_STATUS.OPEN, SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.SCHEDULED]
export const EXPORTABLE_STATUSES = [SESSION_STATUS.PENDING_REVIEW, SESSION_STATUS.APPROVED]

export const SESSION_STATUS_CONFIG = {
  [SESSION_STATUS.SCHEDULED]:      { label: 'Scheduled',      variant: 'purple' },
  [SESSION_STATUS.OPEN]:           { label: 'Open',           variant: 'blue' },
  [SESSION_STATUS.IN_PROGRESS]:    { label: 'In progress',    variant: 'blue' },
  [SESSION_STATUS.PENDING_REVIEW]: { label: 'Pending review', variant: 'amber' },
  [SESSION_STATUS.APPROVED]:       { label: 'Approved',       variant: 'green' },
  [SESSION_STATUS.REJECTED]:       { label: 'Rejected',       variant: 'red' },
}

// ── SECTION STATUSES ──────────────────────────────────────────────

export const SECTION_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  APPROVED: 'approved',
}

// ── ITEM STATUSES ─────────────────────────────────────────────────

export const ITEM_STATUS = {
  PENDING: 'pending',
  MATCHED: 'matched',
  VARIANCE: 'variance',
  QUARANTINE: 'quarantine',
  RECOUNT_PENDING: 'recount_pending',
  RECOUNT_IN_PROGRESS: 'recount_in_progress',
  ESCALATED: 'escalated',
}

// ── COUNT MODES ───────────────────────────────────────────────────

export const COUNT_MODE = {
  VISIBLE: 'visible',
  BLIND: 'blind',
}

// ── COUNT TYPES ───────────────────────────────────────────────────

export const COUNT_TYPE = {
  QUICK: 'quick',
  STANDARD: 'standard',
  FULL: 'full',
  CUSTOM: 'custom',
  WALL_TO_WALL: 'wall_to_wall',
}

export const COUNT_TYPE_CONFIG = [
  {
    key: COUNT_TYPE.QUICK,
    label: 'Quick count',
    desc: 'Stored bins only. Fast, focused on primary stock.',
    color: 'var(--cw-blue)',
  },
  {
    key: COUNT_TYPE.STANDARD,
    label: 'Standard count',
    desc: 'Stored + In Process + Spares. Recommended for weekly cadence.',
    color: 'var(--purple)',
  },
  {
    key: COUNT_TYPE.FULL,
    label: 'Full count',
    desc: 'All bins including RMA and Scrap. For audits, wall-to-wall, and monthly.',
    color: 'var(--red)',
  },
  {
    key: COUNT_TYPE.WALL_TO_WALL,
    label: 'Wall-to-wall count',
    desc: 'All bins, blind mode enforced. Full audit trail with mandatory recount on variances. For SOX compliance and formal audits.',
    color: 'var(--amber)',
  },
  {
    key: COUNT_TYPE.CUSTOM,
    label: 'Custom count',
    desc: 'Choose specific bins, categories, or SKUs to count.',
    color: 'var(--text-muted)',
  },
]

// ── RECOUNT ROUNDS ────────────────────────────────────────────────

export const RECOUNT_ROUND = {
  ROUND_1: 1,
  ROUND_2: 2,
  ROUND_3: 3,
}

export const MAX_RECOUNT_ROUNDS = 3

export const RECOUNT_STATUS = {
  PENDING: 'recount_pending',
  IN_PROGRESS: 'recount_in_progress',
  COMPLETED: 'recount_completed',
}

// ── BINS ──────────────────────────────────────────────────────────

export const BIN = {
  STORED: 'Stored',
  IN_PROCESS: 'In Process',
  SPARES: 'Spares',
  RMA_PENDING: 'RMA_Pending',
  RMA_VENDOR: 'RMA_Vendor',
  SCRAP_PENDING: 'Scrap_Pending',
  RECEIVING_HOLD: 'Receiving_Hold',
}

export const BIN_LABELS = {
  [BIN.STORED]: 'Stored',
  [BIN.IN_PROCESS]: 'In Process',
  [BIN.SPARES]: 'Spares',
  [BIN.RMA_PENDING]: 'RMA Pending',
  [BIN.RMA_VENDOR]: 'RMA Vendor',
  [BIN.SCRAP_PENDING]: 'Scrap Pending',
  [BIN.RECEIVING_HOLD]: 'Receiving Hold',
}

export const BIN_COLORS = {
  [BIN.STORED]: 'var(--cw-blue)',
  [BIN.IN_PROCESS]: 'var(--purple)',
  [BIN.SPARES]: 'var(--green)',
  [BIN.RMA_PENDING]: 'var(--amber)',
  [BIN.RMA_VENDOR]: 'var(--red)',
  [BIN.SCRAP_PENDING]: 'var(--text-muted)',
  [BIN.RECEIVING_HOLD]: 'var(--blue)',
}

export const DEFAULT_BINS = [
  BIN.STORED, BIN.IN_PROCESS, BIN.SPARES,
  BIN.RMA_PENDING, BIN.RMA_VENDOR, BIN.SCRAP_PENDING, BIN.RECEIVING_HOLD,
]

/**
 * Returns which bins are included for a given count type.
 */
export function getBinsForCountType(type, siteBins) {
  const bins = siteBins || DEFAULT_BINS
  const map = {
    [COUNT_TYPE.QUICK]:        bins.filter(b => b === BIN.STORED),
    [COUNT_TYPE.STANDARD]:     bins.filter(b => [BIN.STORED, BIN.IN_PROCESS, BIN.SPARES].includes(b)),
    [COUNT_TYPE.FULL]:         bins,
    [COUNT_TYPE.WALL_TO_WALL]: bins,
  }
  return map[type] || [BIN.STORED]
}

/**
 * Formats a bin key for display.
 */
export function formatBinLabel(key) {
  if (!key) return ''
  return BIN_LABELS[key] || key.replace(/_/g, ' ')
}

// ── VARIANCE REASONS ──────────────────────────────────────────────

export const VARIANCE_REASONS = [
  { key: 'recount_confirmed',   label: 'Recount confirmed',     desc: 'Recounted and variance persists' },
  { key: 'damaged',             label: 'Damaged / defective',   desc: 'Item found but not in usable condition' },
  { key: 'missing',             label: 'Missing',               desc: 'Expected but not physically present' },
  { key: 'found_extra',         label: 'Found extra',           desc: 'More than expected, possible receiving error or misplacement' },
  { key: 'wrong_location',      label: 'Wrong location',        desc: 'Item is here but belongs in a different bin or site' },
  { key: 'pending_transaction', label: 'Pending transaction',   desc: 'Transaction not yet processed in NetSuite (e.g. RMA, transfer)' },
  { key: 'investigation',       label: 'Pending investigation', desc: 'Needs manager review before resolution' },
]

export function getVarianceReasonLabel(key) {
  return VARIANCE_REASONS.find(r => r.key === key)?.label || key
}

// ── USER ROLES ────────────────────────────────────────────────────

export const ROLE = {
  ICS: 'ics',
  MANAGER: 'manager',
  ADMIN: 'admin',
}

export const ROLE_LABELS = {
  [ROLE.ICS]: 'Inventory Control Specialist',
  [ROLE.MANAGER]: 'Inventory Manager',
  [ROLE.ADMIN]: 'Administrator',
}

// ── ACCURACY THRESHOLDS ───────────────────────────────────────────

export const ACCURACY = {
  TARGET: 95,
  GOOD: 85,
}

export function getAccuracyVariant(accuracy) {
  if (accuracy == null) return 'gray'
  if (accuracy >= ACCURACY.TARGET) return 'green'
  if (accuracy >= ACCURACY.GOOD) return 'amber'
  return 'red'
}

export function getAccuracyRating(accuracy) {
  if (accuracy == null) return 'N/A'
  if (accuracy >= ACCURACY.TARGET) return '⭐ Excellent'
  if (accuracy >= ACCURACY.GOOD) return '👍 Good'
  return '⚠️ Needs attention'
}

// ── AUDIT LOG ACTIONS ─────────────────────────────────────────────

export const AUDIT_ACTION = {
  SESSION_CREATED: 'session_created',
  SESSION_STARTED: 'session_started',
  SESSION_SUBMITTED: 'session_submitted',
  SESSION_APPROVED: 'session_approved',
  SESSION_REJECTED: 'session_rejected',
  SECTION_CLAIMED: 'section_claimed',
  SECTION_COMPLETED: 'section_completed',
  ITEM_COUNTED: 'item_counted',
  ITEM_RECOUNT_REQUESTED: 'item_recount_requested',
  ITEM_RECOUNTED: 'item_recounted',
  ITEM_FLAGGED: 'item_flagged',
  ITEM_ESCALATED: 'item_escalated',
  ESCALATION_RESOLVED: 'escalation_resolved',
  SERIAL_SCANNED: 'serial_scanned',
  SERIAL_UNEXPECTED: 'serial_unexpected',
  SERIAL_MISSING: 'serial_missing',
  IMPORT_COMPLETED: 'import_completed',
  ROLE_CHANGED: 'role_changed',
}

// ── AUTO-SAVE ─────────────────────────────────────────────────────

export const AUTO_SAVE_DELAY_MS = 2000
export const POLL_INTERVAL_MS = 30000
export const TOAST_DURATION_MS = 3500
export const SCAN_MESSAGE_DURATION_MS = 4000

// ── TABLE ROW CLASSES ─────────────────────────────────────────────

export function getItemRowClass(item) {
  if (item.recountStatus === RECOUNT_STATUS.PENDING) return 'row-recount'
  if (item.recountStatus === RECOUNT_STATUS.IN_PROGRESS) return 'row-recount'
  if (item.status === ITEM_STATUS.ESCALATED) return 'row-escalated'
  if (item.flag) return 'row-quarantine'
  if (item.status === ITEM_STATUS.MATCHED) return 'row-matched'
  if (item.status === ITEM_STATUS.VARIANCE) return 'row-variance'
  return 'row-pending'
}
