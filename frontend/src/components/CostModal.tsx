import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Cost, User } from '../api'
import { CommentSection } from './CommentSection'
import { Modal } from './Modal'

interface CostModalProps {
  cost: Cost
  users: User[]
  currentUser: User
  onUpdate: (payload: {
    title?: string
    reason?: string
    estimated_cost?: number | null
    actual_cost?: number | null
    purchased?: boolean
  }) => void
  onDelete: () => void
  onClose: () => void
}

// Number inputs are edited as text and parsed on blur; empty clears the amount.
const toInput = (value: number | null): string => (value === null ? '' : String(value))

const parseAmount = (raw: string): number | null => {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function CostModal({
  cost,
  users,
  currentUser,
  onUpdate,
  onDelete,
  onClose,
}: CostModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(cost.title)
  const [reason, setReason] = useState(cost.reason)
  const [estimated, setEstimated] = useState(toInput(cost.estimated_cost))
  const [actual, setActual] = useState(toInput(cost.actual_cost))

  useEffect(() => {
    setTitle(cost.title)
    setReason(cost.reason)
    setEstimated(toInput(cost.estimated_cost))
    setActual(toInput(cost.actual_cost))
  }, [cost.id, cost.title, cost.reason, cost.estimated_cost, cost.actual_cost])

  const saveText = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setTitle(cost.title)
      return
    }
    if (trimmed !== cost.title || reason !== cost.reason) {
      onUpdate({ title: trimmed, reason })
    }
  }

  const saveEstimated = () => {
    const value = parseAmount(estimated)
    setEstimated(toInput(value))
    if (value !== cost.estimated_cost) onUpdate({ estimated_cost: value })
  }

  const saveActual = () => {
    const value = parseAmount(actual)
    setActual(toInput(value))
    if (value !== cost.actual_cost) onUpdate({ actual_cost: value })
  }

  return (
    <Modal title={t('cost.modalTitle', { id: cost.id })} onClose={onClose}>
      <div className="modal-form">
        <label>
          {t('cost.what')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveText} />
        </label>
        <label>
          {t('cost.why')}
          <textarea
            value={reason}
            rows={3}
            placeholder={t('cost.whyPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
            onBlur={saveText}
          />
        </label>
        <div className="form-row">
          <label>
            {t('cost.estimatedLabel')}
            <input
              inputMode="decimal"
              placeholder="0"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              onBlur={saveEstimated}
            />
          </label>
          <label>
            {t('cost.actualLabel')}
            <input
              inputMode="decimal"
              placeholder="0"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              onBlur={saveActual}
            />
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={cost.purchased}
            onChange={(e) => onUpdate({ purchased: e.target.checked })}
          />
          {t('costs.purchased')}
        </label>
        <CommentSection
          entityType="cost"
          entityId={cost.id}
          users={users}
          currentUser={currentUser}
        />
        <div className="modal-actions">
          <button type="button" className="danger" onClick={onDelete}>
            {t('cost.delete')}
          </button>
          <button type="button" className="primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
