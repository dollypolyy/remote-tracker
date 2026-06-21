import { useState } from 'react'
import { useCollection } from '../hooks/useStorage'
import { generateId, nowIso } from '../storage'
import type { EarningWay, EarningModel, AiFit, Speed, Scale, MeaningFit, Energy } from '../types'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { VoiceButton } from '../components/VoiceButton'
import cardStyles from '../components/Card.module.css'
import f from '../components/form.module.css'
import styles from './Tab.module.css'

const empty = (): EarningWay => ({
  id: '',
  name: '',
  model: '',
  channel: '',
  aiFit: '',
  entryThreshold: '',
  speed: '',
  scale: '',
  meaningFit: '',
  energy: '',
  whoEarns: '',
  notes: '',
  createdAt: '',
  updatedAt: '',
})

interface Props { hideFab?: boolean }

export function MapTab({ hideFab }: Props = {}) {
  const { items, upsert, remove } = useCollection('ways')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<EarningWay | null>(null)
  const [form, setForm] = useState<EarningWay>(empty())
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  function openAdd() {
    setForm(empty())
    setEditing(null)
    setModal(true)
  }

  function openEdit(item: EarningWay) {
    setForm({ ...item })
    setEditing(item)
    setModal(true)
  }

  function set(field: keyof EarningWay, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function save() {
    if (!form.name.trim()) return
    const now = nowIso()
    upsert({
      ...form,
      id: editing ? editing.id : generateId(),
      createdAt: editing ? editing.createdAt : now,
      updatedAt: now,
    })
    setModal(false)
  }

  const energyColor = (e: string) => e === '↑' ? cardStyles.green : e === '↓' ? cardStyles.pink : cardStyles.muted

  return (
    <div>
      <div className={styles.grid}>
        {items.length === 0 && (
          <div className={styles.empty}>
            здесь пока пусто — нажми <strong>+</strong> и добавь первый способ ✨
          </div>
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
              {item.model && <span className={cardStyles.chip}>{item.model}</span>}
              {item.energy && <span className={`${cardStyles.chip} ${energyColor(item.energy)}`}>энергия {item.energy}</span>}
              {item.aiFit && <span className={`${cardStyles.chip} ${cardStyles.pink}`}>AI-fit {item.aiFit}</span>}
              {item.speed && <span className={`${cardStyles.chip} ${cardStyles.muted}`}>{item.speed}</span>}
              {item.scale && <span className={`${cardStyles.chip} ${cardStyles.muted}`}>потолок: {item.scale}</span>}
              {item.meaningFit && <span className={`${cardStyles.chip} ${cardStyles.muted}`}>смысл: {item.meaningFit}</span>}
            </div>
            {item.channel && <div className={cardStyles.cardNote}>канал: {item.channel}</div>}
            {item.whoEarns && <div className={cardStyles.cardNote}>кто зарабатывает: {item.whoEarns}</div>}
            {item.entryThreshold && <div className={cardStyles.cardNote}>вход: {item.entryThreshold}</div>}
            {item.notes && <div className={cardStyles.cardNote} style={{ marginTop: 8 }}>{item.notes}</div>}
          </div>
        ))}
      </div>

      {!hideFab && <button className={styles.fab} onClick={openAdd} aria-label="Добавить способ заработка">+</button>}

      {modal && (
        <Modal title={editing ? 'редактировать способ' : 'новый способ'} onClose={() => setModal(false)}>
          <div className={f.field}>
            <label className={f.label}>способ заработка *</label>
            <input className={f.input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="фриланс-копирайтинг" />
          </div>
          <div className={f.field}>
            <label className={f.label}>модель</label>
            <select className={f.select} value={form.model} onChange={(e) => set('model', e.target.value as EarningModel)}>
              <option value="">не выбрано</option>
              <option>время</option>
              <option>продуктизир. услуга</option>
              <option>актив-рычаг</option>
            </select>
          </div>
          <div className={f.field}>
            <label className={f.label}>канал</label>
            <input className={f.input} value={form.channel} onChange={(e) => set('channel', e.target.value)} placeholder="Upwork, Telegram, Instagram" />
          </div>
          <div className={f.field}>
            <label className={f.label}>AI-fit (0–3)</label>
            <select className={f.select} value={form.aiFit} onChange={(e) => set('aiFit', e.target.value as AiFit)}>
              <option value="">не выбрано</option>
              <option>0</option><option>1</option><option>2</option><option>3</option>
            </select>
          </div>
          <div className={f.field}>
            <label className={f.label}>порог входа</label>
            <input className={f.input} value={form.entryThreshold} onChange={(e) => set('entryThreshold', e.target.value)} placeholder="нет опыта / нужен портфель" />
          </div>
          <div className={f.field}>
            <label className={f.label}>скорость до первых денег</label>
            <select className={f.select} value={form.speed} onChange={(e) => set('speed', e.target.value as Speed)}>
              <option value="">не выбрано</option>
              <option>дни</option><option>недели</option><option>месяцы</option>
            </select>
          </div>
          <div className={f.field}>
            <label className={f.label}>потолок / масштаб</label>
            <select className={f.select} value={form.scale} onChange={(e) => set('scale', e.target.value as Scale)}>
              <option value="">не выбрано</option>
              <option>низкий</option><option>средний</option><option>высокий</option>
            </select>
          </div>
          <div className={f.field}>
            <label className={f.label}>смысл-фит</label>
            <select className={f.select} value={form.meaningFit} onChange={(e) => set('meaningFit', e.target.value as MeaningFit)}>
              <option value="">не выбрано</option>
              <option>да</option><option>частично</option><option>нет</option>
            </select>
          </div>
          <div className={f.field}>
            <label className={f.label}>энергия</label>
            <select className={f.select} value={form.energy} onChange={(e) => set('energy', e.target.value as Energy)}>
              <option value="">не выбрано</option>
              <option>↑</option><option>↓</option><option>?</option>
            </select>
          </div>
          <div className={f.field}>
            <label className={f.label}>кто так зарабатывает</label>
            <input className={f.input} value={form.whoEarns} onChange={(e) => set('whoEarns', e.target.value)} placeholder="ники, имена, примеры" />
          </div>
          <div className={f.field}>
            <label className={f.label}>заметки</label>
            <div className={f.voiceRow}>
              <textarea className={f.textarea} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="любые мысли..." rows={3} />
              <VoiceButton onAppend={(t) => set('notes', form.notes + t)} />
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
          message="удалить этот способ заработка?"
          onConfirm={() => { remove(deleteTarget); setDeleteTarget(null) }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
