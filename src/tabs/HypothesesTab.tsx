import { useState } from 'react'
import { useCollection } from '../hooks/useStorage'
import { generateId, nowIso } from '../storage'
import type { Hypothesis, TestType, HypothesisDecision } from '../types'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { VoiceButton } from '../components/VoiceButton'
import cardStyles from '../components/Card.module.css'
import f from '../components/form.module.css'
import styles from './Tab.module.css'

const DECISION_COLORS: Record<HypothesisDecision, string> = {
  'развивать': cardStyles.green,
  'на паузу': cardStyles.muted,
  'в архив': cardStyles.muted,
}

const empty = (): Hypothesis => ({
  id: '', hypothesis: '', fromWay: '', testType: '', minStep: '',
  successMetric: '', deadline: '', result: '', decision: '',
  createdAt: '', updatedAt: '',
})

interface Props { hideFab?: boolean }

export function HypothesesTab({ hideFab }: Props = {}) {
  const { items, upsert, remove } = useCollection('hypotheses')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Hypothesis | null>(null)
  const [form, setForm] = useState<Hypothesis>(empty())
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  function openAdd() { setForm(empty()); setEditing(null); setModal(true) }
  function openEdit(item: Hypothesis) { setForm({ ...item }); setEditing(item); setModal(true) }
  function set(field: keyof Hypothesis, value: string) { setForm((p) => ({ ...p, [field]: value })) }

  function save() {
    if (!form.hypothesis.trim()) return
    const now = nowIso()
    upsert({ ...form, id: editing ? editing.id : generateId(), createdAt: editing ? editing.createdAt : now, updatedAt: now })
    setModal(false)
  }

  return (
    <div>
      <div className={styles.grid}>
        {items.length === 0 && (
          <div className={styles.empty}>
            гипотез пока нет — попробуй: «я могу зарабатывать X, делая Y для Z» ✨
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className={cardStyles.card}>
            <div className={cardStyles.cardHead}>
              <div className={cardStyles.cardTitle}>{item.hypothesis}</div>
              <div className={cardStyles.cardActions}>
                <button className={cardStyles.iconBtn} onClick={() => openEdit(item)} aria-label="Редактировать">✏️</button>
                <button className={cardStyles.iconBtn} onClick={() => setDeleteTarget(item.id)} aria-label="Удалить">🗑</button>
              </div>
            </div>
            <div className={cardStyles.chips}>
              {item.testType && <span className={cardStyles.chip}>{item.testType}</span>}
              {item.decision && (
                <span className={`${cardStyles.chip} ${DECISION_COLORS[item.decision as HypothesisDecision] ?? ''}`}>
                  {item.decision}
                </span>
              )}
              {item.deadline && <span className={`${cardStyles.chip} ${cardStyles.muted}`}>срок: {item.deadline}</span>}
            </div>
            {item.fromWay && <div className={cardStyles.cardNote}>из способа: {item.fromWay}</div>}
            {item.minStep && <div className={cardStyles.cardNote}>минимальный шаг: {item.minStep}</div>}
            {item.successMetric && <div className={cardStyles.cardNote}>метрика: {item.successMetric}</div>}
            {item.result && <div className={cardStyles.cardNote} style={{ marginTop: 8 }}>результат: {item.result}</div>}
          </div>
        ))}
      </div>

      {!hideFab && <button className={styles.fab} onClick={openAdd} aria-label="Добавить гипотезу">+</button>}

      {modal && (
        <Modal title={editing ? 'редактировать гипотезу' : 'новая гипотеза'} onClose={() => setModal(false)}>
          <div className={f.field}>
            <label className={f.label}>гипотеза *</label>
            <div className={f.voiceRow}>
              <textarea
                className={f.textarea}
                value={form.hypothesis}
                onChange={(e) => set('hypothesis', e.target.value)}
                placeholder="Я могу зарабатывать X, делая Y для Z"
                rows={3}
              />
              <VoiceButton onAppend={(t) => set('hypothesis', form.hypothesis + t)} />
            </div>
          </div>
          <div className={f.field}>
            <label className={f.label}>из какого способа</label>
            <input className={f.input} value={form.fromWay} onChange={(e) => set('fromWay', e.target.value)} placeholder="копирайтинг / UX-ревью..." />
          </div>
          <div className={f.field}>
            <label className={f.label}>тип теста</label>
            <select className={f.select} value={form.testType} onChange={(e) => set('testType', e.target.value as TestType)}>
              <option value="">не выбрано</option>
              <option>услуга-оффер</option><option>контент</option><option>лендинг</option><option>пилот</option>
            </select>
          </div>
          <div className={f.field}>
            <label className={f.label}>минимальный шаг (≤1–2 дня)</label>
            <input className={f.input} value={form.minStep} onChange={(e) => set('minStep', e.target.value)} placeholder="написать 3 DM потенциальным клиентам" />
          </div>
          <div className={f.field}>
            <label className={f.label}>метрика успеха</label>
            <input className={f.input} value={form.successMetric} onChange={(e) => set('successMetric', e.target.value)} placeholder="1 ответ / 1 оплата" />
          </div>
          <div className={f.field}>
            <label className={f.label}>срок</label>
            <input className={f.input} type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </div>
          <div className={f.field}>
            <label className={f.label}>результат</label>
            <textarea className={f.textarea} value={form.result} onChange={(e) => set('result', e.target.value)} placeholder="что получилось..." rows={2} />
          </div>
          <div className={f.field}>
            <label className={f.label}>решение</label>
            <select className={f.select} value={form.decision} onChange={(e) => set('decision', e.target.value as HypothesisDecision)}>
              <option value="">не выбрано</option>
              <option>развивать</option><option>на паузу</option><option>в архив</option>
            </select>
          </div>
          <div className={f.actions}>
            <button className={f.btnSecondary} onClick={() => setModal(false)}>отмена</button>
            <button className={f.btnPrimary} onClick={save}>сохранить</button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message="удалить эту гипотезу?"
          onConfirm={() => { remove(deleteTarget); setDeleteTarget(null) }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
