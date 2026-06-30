import { useEffect, useState } from 'react'
import s from './Tasks.module.css'
import { FOCUSES, type FocusKey } from '../activities'
import { getTasks, createTask, updateTask, deleteTask, type Task } from '../lib/data'

const FOCUS_COLORS: Record<FocusKey, string> = {
  biz: 'var(--biz)', sport: 'var(--sport)', blog: 'var(--blog)', other: 'var(--other)',
}
const FOCUS_BTNS: { key: FocusKey; label: string }[] = [
  { key: 'biz', label: '💼 бизнес' },
  { key: 'blog', label: '🎬 блог' },
  { key: 'sport', label: '🏃‍♀️ спорт' },
  { key: 'other', label: '🌿 прочее' },
]

type UrgencyFilter = 'all' | 'urgent' | 'not-urgent'
type ImportanceFilter = 'all' | 'important' | 'not-important'
type FocusFilter = 'all' | FocusKey

const QUADRANTS = [
  { urgent: true,  important: true,  label: '🔴 срочно и важно' },
  { urgent: false, important: true,  label: '⭐ важно, не срочно' },
  { urgent: true,  important: false, label: '⚡ срочно, не важно' },
  { urgent: false, important: false, label: '📝 остальное' },
]

function formatDue(iso: string): { text: string; over: boolean } {
  const d = new Date(iso + 'T12:00:00Z')
  const now = new Date()
  const over = d < now
  const text = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return { text: `до ${text}`, over }
}

interface EditState {
  id: string | null   // null = new task
  text: string
  focus: FocusKey
  urgent: boolean
  important: boolean
  due_date: string
}

const emptyEdit = (): EditState => ({
  id: null, text: '', focus: 'other', urgent: false, important: false, due_date: '',
})

export function Tasks() {
  const [tasks, setTasks]         = useState<Task[]>([])
  const [urgency, setUrgency]     = useState<UrgencyFilter>('all')
  const [importance, setImportance] = useState<ImportanceFilter>('all')
  const [focusF, setFocusF]       = useState<FocusFilter>('all')
  const [showDone, setShowDone]   = useState(false)
  const [edit, setEdit]           = useState<EditState | null>(null)
  const [saving, setSaving]       = useState(false)

  const load = () => getTasks(showDone).then(setTasks)

  useEffect(() => { load() }, [showDone])

  // Отфильтрованные задачи
  const filtered = tasks.filter(t => {
    if (urgency === 'urgent' && !t.urgent) return false
    if (urgency === 'not-urgent' && t.urgent) return false
    if (importance === 'important' && !t.important) return false
    if (importance === 'not-important' && t.important) return false
    if (focusF !== 'all' && t.focus !== focusF) return false
    return true
  })

  // Группировка по квадрантам
  const grouped = QUADRANTS.map(q => ({
    ...q,
    items: filtered.filter(t => t.urgent === q.urgent && t.important === q.important),
  })).filter(g => g.items.length > 0)

  const openNew = () => setEdit(emptyEdit())
  const openEdit = (t: Task) => setEdit({
    id: t.id, text: t.text, focus: t.focus,
    urgent: t.urgent, important: t.important,
    due_date: t.due_date ?? '',
  })

  const toggleDone = async (t: Task, e: React.MouseEvent) => {
    e.stopPropagation()
    await updateTask(t.id, { done: !t.done })
    load()
  }

  const save = async () => {
    if (!edit || !edit.text.trim()) return
    setSaving(true)
    try {
      if (edit.id) {
        await updateTask(edit.id, {
          text: edit.text.trim(), focus: edit.focus,
          urgent: edit.urgent, important: edit.important,
          due_date: edit.due_date || null,
        })
      } else {
        await createTask(
          edit.text.trim(), edit.focus, edit.urgent, edit.important,
          edit.due_date || null
        )
      }
      setEdit(null); load()
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!edit?.id) return
    if (!window.confirm('Удалить задачу?')) return
    await deleteTask(edit.id)
    setEdit(null); load()
  }

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <div className={s.title}>задачи</div>
        <button className={s.addBtn} onClick={openNew}>+ добавить</button>
      </div>

      {/* Фильтры */}
      <div className={s.filterBlock}>
        <div className={s.filterRow}>
          {([['all', 'все'], ['urgent', '🔴 срочно'], ['not-urgent', 'не срочно']] as [UrgencyFilter, string][]).map(([key, label]) => (
            <button key={key} className={`${s.filterChip} ${urgency === key ? s.filterChipActive : ''}`}
              onClick={() => setUrgency(key)}>{label}</button>
          ))}
        </div>
        <div className={s.filterRow}>
          {([['all', 'все'], ['important', '⭐ важно'], ['not-important', 'не важно']] as [ImportanceFilter, string][]).map(([key, label]) => (
            <button key={key} className={`${s.filterChip} ${importance === key ? s.filterChipActive : ''}`}
              onClick={() => setImportance(key)}>{label}</button>
          ))}
        </div>
        <select
          className={s.focusSelect}
          value={focusF}
          onChange={e => setFocusF(e.target.value as FocusFilter)}
        >
          <option value="all">все направления</option>
          <option value="biz">💼 бизнес</option>
          <option value="blog">🎬 блог</option>
          <option value="sport">🏃‍♀️ спорт</option>
          <option value="other">🌿 прочее</option>
        </select>
      </div>

      <button className={s.showDone} onClick={() => setShowDone(v => !v)}>
        {showDone ? 'скрыть выполненные' : 'показать выполненные'}
      </button>

      {grouped.length === 0 && (
        <div className={s.empty}>
          {tasks.length === 0 ? 'задач нет — скажи Виллу или добавь сама' : 'ничего не найдено'}
        </div>
      )}

      {grouped.map(g => (
        <div key={`${g.urgent}-${g.important}`} className={s.group}>
          <div className={s.groupLabel}>{g.label}</div>
          {g.items.map(t => {
            const due = t.due_date ? formatDue(t.due_date) : null
            return (
              <button key={t.id} className={`${s.taskRow} ${t.done ? s.taskDone : ''}`} onClick={() => openEdit(t)}>
                <div
                  className={`${s.checkbox} ${t.done ? s.checkboxDone : ''}`}
                  onClick={(e) => toggleDone(t, e)}
                >
                  {t.done && '✓'}
                </div>
                <div className={s.taskBody}>
                  <div className={s.taskText}>{t.text}</div>
                  <div className={s.taskMeta}>
                    <span className={s.focusDot} style={{ background: FOCUS_COLORS[t.focus] }} />
                    {t.urgent && <span className={`${s.badge} ${s.badgeUrgent}`}>срочно</span>}
                    {t.important && <span className={`${s.badge} ${s.badgeImportant}`}>важно</span>}
                    {due && (
                      <span className={`${s.dueDate} ${due.over ? s.dueDateOver : ''}`}>{due.text}</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ))}

      {/* Add / Edit sheet */}
      {edit && (
        <div className={s.overlay} onClick={() => setEdit(null)}>
          <div className={s.sheet} onClick={e => e.stopPropagation()}>
            <div className={s.grab} />
            <div className={s.sheetTitle}>{edit.id ? 'редактировать' : 'новая задача'}</div>

            <textarea
              className={s.textInput}
              placeholder="что нужно сделать..."
              value={edit.text}
              onChange={e => setEdit({ ...edit, text: e.target.value })}
              autoFocus
            />

            <div className={s.row}>
              <button
                className={`${s.toggleBtn} ${edit.urgent ? s.toggleOn : ''}`}
                onClick={() => setEdit({ ...edit, urgent: !edit.urgent })}
              >🔴 срочно</button>
              <button
                className={`${s.toggleBtn} ${edit.important ? s.toggleOn : ''}`}
                onClick={() => setEdit({ ...edit, important: !edit.important })}
              >⭐ важно</button>
            </div>

            <div className={s.label}>направление</div>
            <div className={s.focusRow}>
              {FOCUS_BTNS.map(({ key, label }) => (
                <button
                  key={key}
                  className={`${s.focusBtn} ${edit.focus === key ? s.focusBtnActive : ''}`}
                  style={edit.focus === key ? { background: FOCUS_COLORS[key] } : {}}
                  onClick={() => setEdit({ ...edit, focus: key })}
                >{label}</button>
              ))}
            </div>

            <div className={s.label}>дедлайн (необязательно)</div>
            <input
              type="date"
              className={s.dateInput}
              value={edit.due_date}
              onChange={e => setEdit({ ...edit, due_date: e.target.value })}
            />

            <div className={s.actions}>
              <button className={s.saveBtn} onClick={save} disabled={saving}>
                {saving ? '…' : edit.id ? 'сохранить' : 'добавить'}
              </button>
              {edit.id && (
                <button className={s.deleteBtn} onClick={remove}>удалить</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
