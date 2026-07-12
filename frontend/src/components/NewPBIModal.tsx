import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Feature, Room, Status } from '../api'
import { Modal } from './Modal'
import { RoomOptions } from './RoomOptions'

interface NewPBIModalProps {
  rooms: Room[]
  features: Feature[]
  defaultRoomId: number | null
  defaultFeatureId: number | null
  onCreate: (payload: {
    title: string
    room_id: number
    description: string
    status: Status
    feature_id: number | null
  }) => void
  onClose: () => void
}

export function NewPBIModal({
  rooms,
  features,
  defaultRoomId,
  defaultFeatureId,
  onCreate,
  onClose,
}: NewPBIModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [roomId, setRoomId] = useState<number | null>(defaultRoomId ?? rooms[0]?.id ?? null)
  const [featureId, setFeatureId] = useState<number | null>(defaultFeatureId)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || roomId === null) return
    onCreate({
      title: title.trim(),
      description: description.trim(),
      room_id: roomId,
      status: 'todo',
      feature_id: featureId,
    })
  }

  return (
    <Modal title={t('newPbi.title')} onClose={onClose}>
      {rooms.length === 0 ? (
        <p>{t('newPbi.needRoom')}</p>
      ) : (
        <form className="modal-form" onSubmit={submit}>
          <label>
            {t('common.title')}
            <input
              autoFocus
              value={title}
              placeholder={t('newPbi.titlePlaceholder')}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {t('common.description')}
            <textarea
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              {t('common.room')}
              <select value={roomId ?? ''} onChange={(e) => setRoomId(Number(e.target.value))}>
                <RoomOptions rooms={rooms} />
              </select>
            </label>
            <label>
              {t('common.feature')}
              <select
                value={featureId ?? ''}
                onChange={(e) =>
                  setFeatureId(e.target.value === '' ? null : Number(e.target.value))
                }
              >
                <option value="">{t('common.none')}</option>
                {features.map((feature) => (
                  <option key={feature.id} value={feature.id}>
                    {feature.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="primary" disabled={!title.trim()}>
              {t('common.create')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
