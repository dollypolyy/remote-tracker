import { useState } from 'react'
import { useCollection } from '../hooks/useStorage'
import { generateId, nowIso } from '../storage'
import type { Person, OutreachStatus } from '../types'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { VoiceButton } from '../components/VoiceButton'
import cardStyles from '../components/Card.module.css'
import f from '../components/form.module.css'
import styles from './Tab.module.css'

const STATUS_COLORS: Record<OutreachStatus, string> = {
  'не писала': cardStyles.muted,
  'написала': cardStyles.chip,
  'ответил(а)': cardStyles.pink,
  'созвон назначен': cardStyles.pink,
  'поговорили': cardStyles.green,
  'архив': cardStyles.muted,
}

const empty = (): Person => ({
  id: '', name: '', foundAt: '', earns: '', connectionToWay: '',
  contact: '', outreachStatus: '', touchDate: '', insights: '',
  createdAt: '', updatedAt: '',
})

interface Props { hideFab?: boolean }

export function PeopleTab({ hideFab }: Props = {}) {
  const { items, upsert, remove } = useCollection('people')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Person | null>(null)
  const [form, setForm] = useState<Person>(empty())
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  function openAdd() { setForm(empty()); setEditing(null); setModal(true) }
  function openEdit(item: Person) { setForm({ ...item }); setEditing(item); setModal(true) }
  function set(field: keyof Person, value: string) { setForm((p) => ({ ...p, [field]: value })) }

  function save() {
    if (!form.name.trim()) return
    const now = nowIso()
    upsert({ ...form, id: editing ? editing.id : generateId(), createdAt: editing ? editing.createdAt : now, updatedAt: now })
    setModal(false)
  }

  return (
    <div>
      <div className={styles.grid}>
        {items.length === 0 && (
          <div className={styles.empty}>здесь пока пусто — добавь первого человека ✨</div>
        )}
        {items.map((item) => (
          <div key={item.id} className={cardStyles.card}>
            <div className={cardStyles.cardHead}>
              <div className={cardStyles.cardTitle}>{item.name}</div>
              <div className={cardStyles.cardActions}>
                <button className={cardStyles.iconBtn} onClick={() => openEdit(item)} aria-label="Редактировать">✏️</button>
                <button className={cardStyles.iconBtn} onClick={() => setDeleteTarget(item.id)} aria-label="Удалить">🗑</button>
              </div>
            </div>
            <div className={cardStyles.chips}>
              {item.outreachStatus && (
                <span className={`${cardStyles.chip} ${STATUS_COLORS[item.outreachStatus as OutreachStatus] ?? ''}`}>
                  {item.outreachStatus}
                </span>
              )}
              {item.touchDate && <span className={`${cardStyles.chip} ${cardStyles.muted}`}>{item.touchDate}</span>}
            </div>
            {item.earns && <div className={cardStyles.cardNote}>зарабатывает: {item.earns}</div>}
            {item.foundAt && <div className={cardStyles.cardNote}>где нашла: {item.foundAt}</div>}
            {item.contact && <div className={cardStyles.cardNote}>контакт: {item.contact}</div>}
            {item.connectionToWay && <div className={cardStyles.cardNote}>связь: {item.connectionToWay}</div>}
            {item.insights && <div className={cardStyles.cardNote} style={{ marginTop: 8 }}>{item.insights}</div>}
          </div>
        ))}
      </div>

      {!hideFab && <button className={styles.fab} onClick={openAdd} aria-label="Добавить человека">+</button>}

      {modal && (
        <Modal title={editing ? 'редактировать контакт' : 'новый человек'} onClose={() => setModal(false)}>
          <div className={f.field}>
            <label className={f.label}>имя / ник *</label>
            <input className={f.input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="@username или Имя Фамилия" />
          </div>
          <div className={f.field}>
            <label className={f.label}>где нашла</label>
            <input className={f.input} value={form.foundAt} onChange={(e) => set('foundAt', e.target.value)} placeholder="Instagram, Twitter, подкаст..." />
          </div>
          <div className={f.field}>
            <label className={f.label}>чем зарабатывает</label>
            <input className={f.input} value={form.earns} onChange={(e) => set('earns', e.target.value)} placeholder="дизайн-спринты для стартапов" />
          </div>
          <div className={f.field}>
            <label className={f.label}>связь со способом</label>
            <input className={f.input} value={form.connectionToWay} onChange={(e) => set('connectionToWay', e.target.value)} placeholder="продуктизир. услуга / UX-ревью" />
          </div>
          <div className={f.field}>
            <label className={f.label}>контакт</label>
            <input className={f.input} value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder="email / tg / dm" />
          </div>
          <div className={f.field}>
            <label className={f.label}>статус аутрича</label>
            <select className={f.select} value={form.outreachStatus} onChange={(e) => set('outreachStatus', e.target.value as OutreachStatus)}>
              <option value="">не выбрано</option>
              <option>не писала</option><option>написала</option><option>ответил(а)</option>
              <option>созвон назначен</option><option>поговорили</option><option>архив</option>
            </select>
          </div>
          <div className={f.field}>
            <label className={f.label}>дата касания</label>
            <input className={f.input} type="date" value={form.touchDate} onChange={(e) => set('touchDate', e.target.value)} />
          </div>
          <div className={f.field}>
            <label className={f.label}>инсайты</label>
            <div className={f.voiceRow}>
              <textarea className={f.textarea} value={form.insights} onChange={(e) => set('insights', e.target.value)} placeholder="что узнала из разговора..." rows={3} />
              <VoiceButton onAppend={(t) => set('insights', form.insights + t)} />
            </div>
          </div>
          <div className={f.actions}>
            <button className={f.btnSecondary} onClick={() => setModal(false)}>отмена</button>
            <button className={f.btnPrimary} onClick={save}>сохранить</button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message="удалить этот контакт?"
          onConfirm={() => { remove(deleteTarget); setDeleteTarget(null) }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
