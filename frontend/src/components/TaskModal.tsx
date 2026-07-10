import { useEffect, useState } from 'react'
import type { Status, Task, User } from '../api'
import { STATUSES, STATUS_LABELS } from '../api'
import { CommentSection } from './CommentSection'
import { Modal } from './Modal'

interface TaskModalProps {
  task: Task
  users: User[]
  currentUser: User
  onUpdate: (payload: {
    title?: string
    description?: string
    status?: Status
    assignee_id?: number | null
  }) => void
  onDelete: () => void
  onClose: () => void
}

export function TaskModal({
  task,
  users,
  currentUser,
  onUpdate,
  onDelete,
  onClose,
}: TaskModalProps) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description)
  }, [task.id, task.title, task.description])

  const saveText = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setTitle(task.title)
      return
    }
    if (trimmed !== task.title || description !== task.description) {
      onUpdate({ title: trimmed, description })
    }
  }

  return (
    <Modal title={`Task #${task.id}`} onClose={onClose}>
      <div className="modal-form">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveText} />
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
        <div className="form-row">
          <label>
            Status
            <select
              value={task.status}
              onChange={(e) => onUpdate({ status: e.target.value as Status })}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select
              value={task.assignee_id ?? ''}
              onChange={(e) =>
                onUpdate({
                  assignee_id: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CommentSection
          entityType="task"
          entityId={task.id}
          users={users}
          currentUser={currentUser}
        />
        <div className="modal-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete task
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
