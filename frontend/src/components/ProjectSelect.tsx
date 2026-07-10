import type { Project } from '../api'

interface ProjectSelectProps {
  projects: Project[]
  onSelect: (project: Project) => void
  onOpenWizard: () => void
}

export function ProjectSelect({ projects, onSelect, onOpenWizard }: ProjectSelectProps) {
  return (
    <div className="user-select">
      <div className="user-select-panel">
        <h1>Renovatie</h1>
        <p className="muted">Pick a project to work on.</p>
        <div className="user-select-list">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="user-select-card"
              onClick={() => onSelect(project)}
            >
              <span className="avatar avatar-lg">{project.name.charAt(0).toUpperCase()}</span>
              <span>{project.name}</span>
            </button>
          ))}
        </div>
        {projects.length === 0 && <p className="muted">No projects yet — create your first one.</p>}
        <button type="button" className="primary" onClick={onOpenWizard}>
          + New project
        </button>
      </div>
    </div>
  )
}
