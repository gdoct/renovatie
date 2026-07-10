import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Feature, User } from '../api'
import { CommentSection } from './CommentSection'
import { Modal } from './Modal'

interface FeatureModalProps {
  feature: Feature
  users: User[]
  currentUser: User
  onUpdate: (payload: { name?: string; description?: string }) => void
  onClose: () => void
}

export function FeatureModal({
  feature,
  users,
  currentUser,
  onUpdate,
  onClose,
}: FeatureModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(feature.name)
  const [description, setDescription] = useState(feature.description)

  useEffect(() => {
    setName(feature.name)
    setDescription(feature.description)
  }, [feature.id, feature.name, feature.description])

  const saveText = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(feature.name)
      return
    }
    if (trimmed !== feature.name || description !== feature.description) {
      onUpdate({ name: trimmed, description })
    }
  }

  return (
    <Modal title={t('feature.modalTitle', { id: feature.id })} onClose={onClose}>
      <div className="modal-form">
        <label>
          {t('common.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveText} />
        </label>
        <label>
          {t('common.description')}
          <textarea
            value={description}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveText}
          />
        </label>
        <CommentSection
          entityType="feature"
          entityId={feature.id}
          users={users}
          currentUser={currentUser}
        />
        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
