import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Cost, Feature, PBI, Room, Status, Task, User } from '../api'
import { costAmount, formatEuro, STATUSES, STATUS_LABELS } from '../api'
import { CommentSection } from './CommentSection'
import { Modal } from './Modal'

interface PBIModalProps {
  pbi: PBI
  rooms: Room[]
  features: Feature[]
  users: User[]
  currentUser: User
  onUpdate: (payload: {
    title?: string
    description?: string
    status?: Status
    room_id?: number
    feature_id?: number | null
    assignee_id?: number | null
  }) => void
  onDelete: () => void
  onAddTask: (title: string) => void
  onToggleTask: (taskId: number, done: boolean) => void
  onSelectTask: (taskId: number) => void
  onAddCost: (title: string, estimated: number | null) => void
  onToggleCost: (costId: number, purchased: boolean) => void
  onSelectCost: (costId: number) => void
  onClose: () => void
}

export function PBIModal({
  pbi,
  rooms,
  features,
  users,
  currentUser,
  onUpdate,
  onDelete,
  onAddTask,
  onToggleTask,
  onSelectTask,
  onAddCost,
  onToggleCost,
  onSelectCost,
  onClose,
}: PBIModalProps) {
  const [title, setTitle] = useState(pbi.title)
  const [description, setDescription] = useState(pbi.description)
  const [newTask, setNewTask] = useState('')
  const [newCost, setNewCost] = useState('')
  const [newCostEstimate, setNewCostEstimate] = useState('')

  useEffect(() => {
    setTitle(pbi.title)
    setDescription(pbi.description)
  }, [pbi.id, pbi.title, pbi.description])

  const saveText = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setTitle(pbi.title)
      return
    }
    if (trimmed !== pbi.title || description !== pbi.description) {
      onUpdate({ title: trimmed, description })
    }
  }

  const submitTask = (event: FormEvent) => {
    event.preventDefault()
    const taskTitle = newTask.trim()
    if (!taskTitle) return
    onAddTask(taskTitle)
    setNewTask('')
  }

  const submitCost = (event: FormEvent) => {
    event.preventDefault()
    const costTitle = newCost.trim()
    if (!costTitle) return
    const parsed = Number(newCostEstimate.trim().replace(',', '.'))
    const estimated =
      newCostEstimate.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    onAddCost(costTitle, estimated)
    setNewCost('')
    setNewCostEstimate('')
  }

  const spent = pbi.costs.filter((c) => c.purchased).reduce((sum, c) => sum + costAmount(c), 0)
  const planned = pbi.costs.reduce((sum, c) => sum + costAmount(c), 0)

  return (
    <Modal title={`PBI #${pbi.id}`} onClose={onClose}>
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
              value={pbi.status}
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
            Room
            <select
              value={pbi.room_id}
              onChange={(e) => onUpdate({ room_id: Number(e.target.value) })}
            >
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
              value={pbi.feature_id ?? ''}
              onChange={(e) =>
                onUpdate({
                  feature_id: e.target.value === '' ? null : Number(e.target.value),
                })
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
          <label>
            Assignee
            <select
              value={pbi.assignee_id ?? ''}
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

        <section className="tasks costs">
          <h3>
            Costs
            {pbi.costs.length > 0 && (
              <span className="costs-total">
                {formatEuro(spent)} spent / {formatEuro(planned)} planned
              </span>
            )}
          </h3>
          {pbi.costs.length === 0 && <p className="muted">No costs yet.</p>}
          {pbi.costs.map((cost) => (
            <CostRow
              key={cost.id}
              cost={cost}
              onToggle={(purchased) => onToggleCost(cost.id, purchased)}
              onOpen={() => onSelectCost(cost.id)}
            />
          ))}
          <form className="add-form" onSubmit={submitCost}>
            <input
              value={newCost}
              placeholder="Add a cost or purchase…"
              onChange={(e) => setNewCost(e.target.value)}
            />
            <input
              className="add-form-amount"
              inputMode="decimal"
              value={newCostEstimate}
              placeholder="€ est."
              onChange={(e) => setNewCostEstimate(e.target.value)}
            />
            <button type="submit" disabled={!newCost.trim()}>
              +
            </button>
          </form>
        </section>

        <section className="tasks">
          <h3>Tasks</h3>
          {pbi.tasks.length === 0 && <p className="muted">No tasks yet.</p>}
          {pbi.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              users={users}
              onToggle={(done) => onToggleTask(task.id, done)}
              onOpen={() => onSelectTask(task.id)}
            />
          ))}
          <form className="add-form" onSubmit={submitTask}>
            <input
              value={newTask}
              placeholder="Add a task…"
              onChange={(e) => setNewTask(e.target.value)}
            />
            <button type="submit" disabled={!newTask.trim()}>
              +
            </button>
          </form>
        </section>

        <CommentSection
          entityType="pbi"
          entityId={pbi.id}
          users={users}
          currentUser={currentUser}
        />

        <div className="modal-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete PBI
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

interface CostRowProps {
  cost: Cost
  onToggle: (purchased: boolean) => void
  onOpen: () => void
}

function CostRow({ cost, onToggle, onOpen }: CostRowProps) {
  return (
    <div className={`task-row cost-row${cost.purchased ? ' cost-purchased' : ''}`}>
      <input
        type="checkbox"
        className="task-check cost-check"
        checked={cost.purchased}
        title={cost.purchased ? 'Mark as not purchased' : 'Mark as purchased'}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <button type="button" className="task-title cost-title task-open" onClick={onOpen}>
        {cost.title}
      </button>
      <span className="cost-amount" title={cost.actual_cost !== null ? 'Actual' : 'Estimated'}>
        {cost.actual_cost === null && cost.estimated_cost !== null && '~'}
        {formatEuro(costAmount(cost))}
      </span>
    </div>
  )
}

interface TaskRowProps {
  task: Task
  users: User[]
  onToggle: (done: boolean) => void
  onOpen: () => void
}

function TaskRow({ task, users, onToggle, onOpen }: TaskRowProps) {
  const assignee = users.find((u) => u.id === task.assignee_id)

  return (
    <div className={`task-row task-${task.status}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={task.status === 'done'}
        title={task.status === 'done' ? 'Reopen task' : 'Mark task done'}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <button type="button" className="task-title task-open" onClick={onOpen}>
        {task.title}
      </button>
      {task.status === 'in_progress' && <span className="badge badge-progress">In progress</span>}
      {assignee && (
        <span className="avatar avatar-sm" title={assignee.name}>
          {assignee.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}
