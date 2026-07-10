import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Comment, EntityType, User } from '../api'
import { api } from '../api'

interface CommentSectionProps {
  entityType: EntityType
  entityId: number
  users: User[]
  currentUser: User
}

function formatTimestamp(createdAt: string): string {
  const iso = createdAt.endsWith('Z') ? createdAt : `${createdAt}Z`
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function CommentSection({ entityType, entityId, users, currentUser }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listComments(entityType, entityId)
      .then((list) => {
        if (!cancelled) setComments(list)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load comments')
      })
    return () => {
      cancelled = true
    }
  }, [entityType, entityId])

  const post = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      const comment = await api.createComment({
        entity_type: entityType,
        entity_id: entityId,
        body: text,
        author_id: currentUser.id,
      })
      setComments((current) => [...current, comment])
      setBody('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post comment')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (commentId: number) => {
    setError(null)
    try {
      await api.deleteComment(commentId)
      setComments((current) => current.filter((c) => c.id !== commentId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete comment')
    }
  }

  const attachImage = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const url = await api.uploadImage(file)
      setBody(
        (current) =>
          `${current}${current && !current.endsWith('\n') ? '\n' : ''}![${file.name}](${url})\n`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload image')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="comments">
      <h3>Comments</h3>
      {comments.length === 0 && <p className="muted">No comments yet — start the discussion.</p>}
      {comments.map((comment) => {
        const author = users.find((u) => u.id === comment.author_id)
        return (
          <article key={comment.id} className="comment">
            <header className="comment-header">
              <span className={`avatar avatar-sm${author ? '' : ' avatar-empty'}`}>
                {author ? author.name.charAt(0).toUpperCase() : '?'}
              </span>
              <span className="comment-author">{author?.name ?? 'Former user'}</span>
              <span className="comment-time">{formatTimestamp(comment.created_at)}</span>
              <button
                type="button"
                className="icon-button"
                title="Delete comment"
                onClick={() => void remove(comment.id)}
              >
                ✕
              </button>
            </header>
            <div className="comment-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.body}</ReactMarkdown>
            </div>
          </article>
        )
      })}
      {error && <p className="comment-error">{error}</p>}
      <form className="comment-form" onSubmit={(e) => void post(e)}>
        <textarea
          value={body}
          rows={3}
          placeholder="Write a comment… (markdown supported)"
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="comment-form-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void attachImage(file)
              e.target.value = ''
            }}
          />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
            🖼 Add image
          </button>
          <button type="submit" className="primary" disabled={busy || !body.trim()}>
            Comment
          </button>
        </div>
      </form>
    </section>
  )
}
