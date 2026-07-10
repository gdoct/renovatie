import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Feature, Room, Status } from '../api'
import { Modal } from './Modal'

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
    <Modal title="New PBI" onClose={onClose}>
      {rooms.length === 0 ? (
        <p>Add a room in the sidebar first — every PBI belongs to a room.</p>
      ) : (
        <form className="modal-form" onSubmit={submit}>
          <label>
            Title
            <input
              autoFocus
              value={title}
              placeholder="e.g. Tile the bathroom floor"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Room
              <select value={roomId ?? ''} onChange={(e) => setRoomId(Number(e.target.value))}>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Feature
              <select
                value={featureId ?? ''}
                onChange={(e) =>
                  setFeatureId(e.target.value === '' ? null : Number(e.target.value))
                }
              >
                <option value="">— none —</option>
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
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!title.trim()}>
              Create
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
