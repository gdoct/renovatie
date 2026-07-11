import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Feature, PBI, Project, Room, Status, User } from './api'
import { api } from './api'
import { Backlog } from './components/Backlog'
import { LanguageToggle } from './components/LanguageToggle'
import { Board } from './components/Board'
import { CostDashboard } from './components/CostDashboard'
import { CostModal } from './components/CostModal'
import { Dashboard } from './components/Dashboard'
import { FeatureModal } from './components/FeatureModal'
import { NewPBIModal } from './components/NewPBIModal'
import { NewProjectWizard } from './components/NewProjectWizard'
import { PBIModal } from './components/PBIModal'
import { ProjectConfig } from './components/ProjectConfig'
import { ProjectSelect } from './components/ProjectSelect'
import { Sidebar } from './components/Sidebar'
import type { AssigneeFilter } from './components/Sidebar'
import { TaskModal } from './components/TaskModal'
import { UserSelect } from './components/UserSelect'
import './App.css'

const CURRENT_USER_KEY = 'renovatie.currentUserId'
const CURRENT_PROJECT_KEY = 'renovatie.currentProjectId'
const SIDEBAR_OPEN_KEY = 'renovatie.sidebarOpen'

function App() {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<Project[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [pbis, setPbis] = useState<PBI[]>([])
  const [roomFilter, setRoomFilter] = useState<number[]>([])
  const [featureFilter, setFeatureFilter] = useState<number[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter[]>([])
  const [view, setView] = useState<'board' | 'backlog' | 'dashboard' | 'costs'>('board')
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY)
    return stored === null ? true : stored === 'true'
  })
  const [selectedPbiId, setSelectedPbiId] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [selectedCostId, setSelectedCostId] = useState<number | null>(null)
  const [selectedFeatureId, setSelectedFeatureId] = useState<number | null>(null)
  const [showNewPbi, setShowNewPbi] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<number | null>(() => {
    const stored = localStorage.getItem(CURRENT_USER_KEY)
    return stored === null ? null : Number(stored)
  })
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(() => {
    const stored = localStorage.getItem(CURRENT_PROJECT_KEY)
    return stored === null ? null : Number(stored)
  })

  const selectUser = useCallback((user: User | null) => {
    setCurrentUserId(user?.id ?? null)
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, String(user.id))
    } else {
      localStorage.removeItem(CURRENT_USER_KEY)
    }
  }, [])

  const selectProject = useCallback((project: Project | null) => {
    setCurrentProjectId(project?.id ?? null)
    if (project) {
      localStorage.setItem(CURRENT_PROJECT_KEY, String(project.id))
    } else {
      localStorage.removeItem(CURRENT_PROJECT_KEY)
    }
    // Filters reference the previous project's entities.
    setRoomFilter([])
    setFeatureFilter([])
    setAssigneeFilter([])
    setShowConfig(false)
  }, [])

  const refresh = useCallback(async () => {
    const projectList = await api.listProjects()
    setProjects(projectList)
    // A stale stored id (e.g. the project was deleted elsewhere) would 404 the
    // scoped fetches below; bail out and let the guard effect clear it.
    if (currentProjectId === null || !projectList.some((p) => p.id === currentProjectId)) {
      return
    }
    const [roomList, featureList, userList, pbiList] = await Promise.all([
      api.listRooms(currentProjectId),
      api.listFeatures(currentProjectId),
      api.listProjectUsers(currentProjectId),
      api.listPbis(currentProjectId),
    ])
    setRooms(roomList)
    setFeatures(featureList)
    setUsers(userList)
    setPbis(pbiList)
  }, [currentProjectId])

  useEffect(() => {
    refresh()
      .then(() => setLoaded(true))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : t('errors.backendUnreachable')),
      )
  }, [refresh, t])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null)
      try {
        await action()
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : t('errors.generic'))
        await refresh().catch(() => undefined)
      }
    },
    [refresh, t],
  )

  const toggleTask = useCallback(
    (taskId: number, done: boolean) =>
      run(() => api.updateTask(taskId, { status: done ? 'done' : 'todo' })),
    [run],
  )

  const toggleCost = useCallback(
    (costId: number, purchased: boolean) => run(() => api.updateCost(costId, { purchased })),
    [run],
  )

  const movePbi = useCallback(
    (pbiId: number, status: Status, priority?: number) => {
      setPbis((current) =>
        current.map((p) =>
          p.id === pbiId ? { ...p, status, priority: priority ?? p.priority } : p,
        ),
      )
      void run(() =>
        api.updatePbi(pbiId, priority === undefined ? { status } : { status, priority }),
      )
    },
    [run],
  )

  const visiblePbis = useMemo(
    () =>
      pbis.filter(
        (p) =>
          (roomFilter.length === 0 || roomFilter.includes(p.room_id)) &&
          (featureFilter.length === 0 ||
            (p.feature_id !== null && featureFilter.includes(p.feature_id))) &&
          (assigneeFilter.length === 0 ||
            (p.assignee_id === null
              ? assigneeFilter.includes('unassigned')
              : assigneeFilter.includes(p.assignee_id))),
      ),
    [pbis, roomFilter, featureFilter, assigneeFilter],
  )

  const selectedPbi =
    selectedPbiId === null ? null : (pbis.find((p) => p.id === selectedPbiId) ?? null)

  const selectedTask =
    selectedTaskId === null
      ? null
      : (pbis.flatMap((p) => p.tasks).find((t) => t.id === selectedTaskId) ?? null)

  const selectedCost =
    selectedCostId === null
      ? null
      : (pbis.flatMap((p) => p.costs).find((c) => c.id === selectedCostId) ?? null)

  const selectedFeature =
    selectedFeatureId === null ? null : (features.find((f) => f.id === selectedFeatureId) ?? null)

  const currentProject =
    currentProjectId === null ? null : (projects.find((p) => p.id === currentProjectId) ?? null)

  const currentUser =
    currentUserId === null ? null : (users.find((u) => u.id === currentUserId) ?? null)

  useEffect(() => {
    if (loaded && currentProjectId !== null && !projects.some((p) => p.id === currentProjectId)) {
      selectProject(null)
    }
  }, [loaded, projects, currentProjectId, selectProject])

  // Also clears the stored user when they are not a member of the selected
  // project, since `users` holds that project's members.
  useEffect(() => {
    if (loaded && currentUserId !== null && !users.some((u) => u.id === currentUserId)) {
      selectUser(null)
    }
  }, [loaded, users, currentUserId, selectUser])

  useEffect(() => {
    if (
      loaded &&
      assigneeFilter.some((f) => typeof f === 'number' && !users.some((u) => u.id === f))
    ) {
      setAssigneeFilter((current) =>
        current.filter((f) => f === 'unassigned' || users.some((u) => u.id === f)),
      )
    }
  }, [loaded, users, assigneeFilter])

  const activeRoomNames = rooms.filter((r) => roomFilter.includes(r.id)).map((r) => r.name)
  const activeFeatureNames = features.filter((f) => featureFilter.includes(f.id)).map((f) => f.name)
  const activeAssigneeNames = assigneeFilter.map((f) =>
    f === 'unassigned' ? t('common.unassigned') : (users.find((u) => u.id === f)?.name ?? ''),
  )

  const errorBanner = error && (
    <div className="error-banner" role="alert">
      {error}
      <button type="button" onClick={() => setError(null)}>
        ✕
      </button>
    </div>
  )

  if (!loaded) {
    return (
      <div className="app">
        {errorBanner}
        <p className="loading">{t('common.loading')}</p>
      </div>
    )
  }

  if (currentProject === null) {
    return (
      <>
        {errorBanner}
        <ProjectSelect
          projects={projects}
          onSelect={selectProject}
          onOpenWizard={() => setShowWizard(true)}
        />
        {showWizard && (
          <NewProjectWizard
            onDone={(project) => {
              setShowWizard(false)
              // Make the new project known before selecting it, so the
              // stale-project guard doesn't bounce back to this screen
              // while the refresh is still in flight.
              setProjects((current) =>
                current.some((p) => p.id === project.id) ? current : [...current, project],
              )
              selectProject(project)
            }}
            onClose={() => setShowWizard(false)}
          />
        )}
      </>
    )
  }

  if (currentUser === null) {
    return (
      <>
        {errorBanner}
        <UserSelect
          projectName={currentProject.name}
          users={users}
          onSelect={selectUser}
          onCreate={(name) =>
            void run(async () => {
              const user = await api.createUser(name)
              await api.addProjectUser(currentProject.id, user.id)
              await refresh()
              selectUser(user)
            })
          }
          onBack={() => selectProject(null)}
        />
      </>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          <button
            type="button"
            className="brand-name"
            title={t('app.switchProject')}
            onClick={() => selectProject(null)}
          >
            <img src="/favicon.svg" alt="" className="brand-logo" />
            {currentProject.name}
          </button>
          {(view === 'board' || view === 'backlog') && (
            <>
              {activeRoomNames.length > 0 && (
                <span className="scope"> / {activeRoomNames.join(', ')}</span>
              )}
              {activeFeatureNames.length > 0 && (
                <span className="scope"> / {activeFeatureNames.join(', ')}</span>
              )}
              {activeAssigneeNames.length > 0 && (
                <span className="scope"> / {activeAssigneeNames.join(', ')}</span>
              )}
            </>
          )}
        </h1>
        <nav className="view-nav">
          <button
            type="button"
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
          >
            {t('nav.board')}
          </button>
          <button
            type="button"
            className={view === 'backlog' ? 'active' : ''}
            onClick={() => setView('backlog')}
          >
            {t('nav.backlog')}
          </button>
          <button
            type="button"
            className={view === 'dashboard' ? 'active' : ''}
            onClick={() => setView('dashboard')}
          >
            {t('nav.dashboard')}
          </button>
          <button
            type="button"
            className={view === 'costs' ? 'active' : ''}
            onClick={() => setView('costs')}
          >
            {t('nav.costs')}
          </button>
        </nav>
        <div className="topbar-actions">
          <LanguageToggle />
          <button
            type="button"
            className="current-user"
            title={t('app.switchUser')}
            onClick={() => selectUser(null)}
          >
            <span className="avatar">{currentUser.name.charAt(0).toUpperCase()}</span>
            <span className="current-user-name">{currentUser.name}</span>
          </button>
          <button type="button" className="primary" onClick={() => setShowNewPbi(true)}>
            {t('app.newPbi')}
          </button>
          <button
            type="button"
            className="icon-button gear-button"
            title={t('app.projectSettings')}
            onClick={() => setShowConfig(true)}
          >
            ⚙
          </button>
        </div>
      </header>

      {errorBanner}

      {view === 'dashboard' ? (
        <Dashboard
          currentUser={currentUser}
          users={users}
          rooms={rooms}
          pbis={pbis}
          onOpenRoom={(roomId) => {
            setRoomFilter([roomId])
            setFeatureFilter([])
            setAssigneeFilter([])
            setView('board')
          }}
        />
      ) : view === 'costs' ? (
        <CostDashboard
          rooms={rooms}
          pbis={pbis}
          onToggleCost={toggleCost}
          onSelectCost={setSelectedCostId}
        />
      ) : (
        <div className="layout">
          <Sidebar
            collapsed={!sidebarOpen}
            onToggle={() => {
              setSidebarOpen((open) => {
                const next = !open
                localStorage.setItem(SIDEBAR_OPEN_KEY, String(next))
                return next
              })
            }}
            rooms={rooms}
            features={features}
            users={users}
            pbis={pbis}
            roomFilter={roomFilter}
            featureFilter={featureFilter}
            assigneeFilter={assigneeFilter}
            onRoomFilter={setRoomFilter}
            onFeatureFilter={setFeatureFilter}
            onAssigneeFilter={setAssigneeFilter}
          />
          <main className="board-area">
            {loaded && rooms.length === 0 && pbis.length === 0 ? (
              <div className="empty-state">
                <h2>{t('app.welcome', { name: currentProject.name })}</h2>
                <p>{t('app.welcomeHint')}</p>
              </div>
            ) : view === 'backlog' ? (
              <Backlog
                pbis={visiblePbis}
                rooms={rooms}
                features={features}
                users={users}
                onMove={movePbi}
                onAssign={(pbiId, assigneeId) =>
                  run(() => api.updatePbi(pbiId, { assignee_id: assigneeId }))
                }
                onSelect={setSelectedPbiId}
              />
            ) : (
              <Board
                pbis={visiblePbis}
                rooms={rooms}
                features={features}
                users={users}
                onMove={movePbi}
                onAssign={(pbiId, assigneeId) =>
                  run(() => api.updatePbi(pbiId, { assignee_id: assigneeId }))
                }
                onToggleTask={toggleTask}
                onToggleCost={toggleCost}
                onSelect={setSelectedPbiId}
              />
            )}
          </main>
        </div>
      )}

      {showConfig && (
        <ProjectConfig
          project={currentProject}
          rooms={rooms}
          features={features}
          members={users}
          pbis={pbis}
          currentUser={currentUser}
          run={run}
          onOpenFeature={setSelectedFeatureId}
          onProjectDeleted={() => selectProject(null)}
          onClose={() => setShowConfig(false)}
        />
      )}

      {showNewPbi && (
        <NewPBIModal
          rooms={rooms}
          features={features}
          defaultRoomId={roomFilter.length === 1 ? roomFilter[0] : null}
          defaultFeatureId={featureFilter.length === 1 ? featureFilter[0] : null}
          onCreate={(payload) => {
            setShowNewPbi(false)
            void run(() => api.createPbi(payload))
          }}
          onClose={() => setShowNewPbi(false)}
        />
      )}

      {selectedPbi && (
        <PBIModal
          pbi={selectedPbi}
          rooms={rooms}
          features={features}
          users={users}
          currentUser={currentUser}
          onUpdate={(payload) => run(() => api.updatePbi(selectedPbi.id, payload))}
          onDelete={() => {
            setSelectedPbiId(null)
            void run(() => api.deletePbi(selectedPbi.id))
          }}
          onAddTask={(title) => run(() => api.createTask({ title, pbi_id: selectedPbi.id }))}
          onToggleTask={toggleTask}
          onSelectTask={setSelectedTaskId}
          onAddCost={(title, estimated) =>
            run(() => api.createCost({ title, pbi_id: selectedPbi.id, estimated_cost: estimated }))
          }
          onToggleCost={toggleCost}
          onSelectCost={setSelectedCostId}
          onClose={() => setSelectedPbiId(null)}
        />
      )}

      {selectedFeature && (
        <FeatureModal
          feature={selectedFeature}
          users={users}
          currentUser={currentUser}
          onUpdate={(payload) => run(() => api.updateFeature(selectedFeature.id, payload))}
          onClose={() => setSelectedFeatureId(null)}
        />
      )}

      {selectedCost && (
        <CostModal
          cost={selectedCost}
          users={users}
          currentUser={currentUser}
          onUpdate={(payload) => run(() => api.updateCost(selectedCost.id, payload))}
          onDelete={() => {
            setSelectedCostId(null)
            void run(() => api.deleteCost(selectedCost.id))
          }}
          onClose={() => setSelectedCostId(null)}
        />
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          users={users}
          currentUser={currentUser}
          onUpdate={(payload) => run(() => api.updateTask(selectedTask.id, payload))}
          onDelete={() => {
            setSelectedTaskId(null)
            void run(() => api.deleteTask(selectedTask.id))
          }}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  )
}

export default App
