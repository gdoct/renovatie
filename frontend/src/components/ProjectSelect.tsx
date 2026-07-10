import { useTranslation } from 'react-i18next'
import type { Project } from '../api'
import { LanguageToggle } from './LanguageToggle'

interface ProjectSelectProps {
  projects: Project[]
  onSelect: (project: Project) => void
  onOpenWizard: () => void
}

export function ProjectSelect({ projects, onSelect, onOpenWizard }: ProjectSelectProps) {
  const { t } = useTranslation()

  return (
    <div className="user-select">
      <div className="login-lang">
        <LanguageToggle full />
      </div>
      <div className="user-select-panel">
        <h1>Renovatie</h1>
        <p className="muted">{t('projectSelect.subtitle')}</p>
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
        {projects.length === 0 && <p className="muted">{t('projectSelect.empty')}</p>}
        <button type="button" className="primary" onClick={onOpenWizard}>
          {t('projectSelect.newProject')}
        </button>
      </div>
    </div>
  )
}
