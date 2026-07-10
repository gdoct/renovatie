import { useEffect, useState } from 'react'
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
    <Modal title={`Feature #${feature.id}`} onClose={onClose}>
      <div className="modal-form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveText} />
        </label>
        <label>
          Description
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
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
