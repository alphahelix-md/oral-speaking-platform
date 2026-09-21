'use client';

import { useMemo, useState } from 'react';
import { CheckSquare, Square, Trash2 } from 'lucide-react';
import type { Session } from '@/types/speaking';

type UiLanguage = 'zh-CN' | 'en' | 'zh-HK' | 'ja';
type Props = { sessions: Session[]; uiLanguage: UiLanguage; onOpen: (session: Session) => void; onDelete: (ids: string[]) => Promise<void> };

const copy = {
  'zh-CN': { title: '学习记录管理', intro: '按练习批量管理。删除练习会同步删除本机的关联录音；已上传的私有改进库副本需在“我的”中撤回授权后删除。', all: '全选', clear: '取消选择', selected: '已选', delete: '删除所选', deleting: '删除中…', confirm: '确定删除已选的 {count} 条学习记录及本机关联录音吗？此操作无法撤销。已上传的私有改进库副本不会在这里删除。', empty: '还没有可管理的学习记录。', failed: '删除失败，请重试。', answers: '个回答', min: '分钟', open: '查看' },
  en: { title: 'Manage learning records', intro: 'Manage completed practices in batches. Deleting a practice also deletes its linked local audio. Private improvement-library copies must be removed by revoking consent in Profile.', all: 'Select all', clear: 'Clear', selected: 'selected', delete: 'Delete selected', deleting: 'Deleting…', confirm: 'Delete {count} selected learning records and their linked local audio? This cannot be undone. Private improvement-library copies are not deleted here.', empty: 'No learning records to manage yet.', failed: 'Could not delete. Try again.', answers: 'answers', min: 'min', open: 'View' },
  'zh-HK': { title: '學習記錄管理', intro: '可按練習批量管理。刪除練習會同步刪除本機關聯錄音；已上傳的私人改善資料庫副本，需在「我的」撤回授權後刪除。', all: '全選', clear: '取消選擇', selected: '已選', delete: '刪除所選', deleting: '刪除中…', confirm: '確定刪除已選的 {count} 條學習記錄及本機關聯錄音嗎？此操作無法復原。已上傳的私人改善資料庫副本不會在這裏刪除。', empty: '暫時沒有可管理的學習記錄。', failed: '刪除失敗，請重試。', answers: '個回答', min: '分鐘', open: '查看' },
  ja: { title: '学習記録を管理', intro: '練習単位で一括管理できます。練習を削除すると端末内の関連音声も削除されます。非公開の改善ライブラリのコピーは、プロフィールで同意を撤回して削除してください。', all: 'すべて選択', clear: '選択解除', selected: '件を選択', delete: '選択分を削除', deleting: '削除中…', confirm: '選択した {count} 件の学習記録と関連する端末内音声を削除しますか？元に戻せません。非公開の改善ライブラリのコピーはここでは削除されません。', empty: '管理できる学習記録はまだありません。', failed: '削除できませんでした。もう一度お試しください。', answers: '回答', min: '分', open: '表示' },
} satisfies Record<UiLanguage, Record<string, string>>;

export function LearningRecordManager({ sessions, uiLanguage, onOpen, onDelete }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = copy[uiLanguage];
  const records = useMemo(() => [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [sessions]);
  const allSelected = records.length > 0 && records.every(record => selected.has(record.id));

  function toggle(id: string) {
    setSelected(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function removeSelected() {
    const ids = [...selected];
    if (!ids.length || !window.confirm(t.confirm.replace('{count}', String(ids.length)))) return;
    setBusy(true); setError('');
    try {
      await onDelete(ids);
      setSelected(new Set());
    } catch { setError(t.failed); }
    finally { setBusy(false); }
  }

  return <section className="record-manager">
    <div className="page-intro"><span className="section-kicker">ORAL / RECORDS</span><h1>{t.title}</h1><p>{t.intro}</p></div>
    {error && <div className="notice" role="alert">{error}</div>}
    {records.length ? <>
      <div className="record-manager-toolbar">
        <button onClick={() => setSelected(allSelected ? new Set() : new Set(records.map(record => record.id)))}>{allSelected ? <CheckSquare size={17} /> : <Square size={17} />}{allSelected ? t.clear : t.all}</button>
        <span>{selected.size} {t.selected}</span>
        <button className="record-delete-button" disabled={!selected.size || busy} onClick={removeSelected}><Trash2 size={16} /> {busy ? t.deleting : t.delete}</button>
      </div>
      <div className="record-manager-list">{records.map(record => {
        const seconds = record.turns.reduce((total, turn) => total + (Number(turn.durationSeconds) || 0), 0);
        return <article className={'managed-record ' + (selected.has(record.id) ? 'selected' : '')} key={record.id}>
          <button className="record-select" aria-label={selected.has(record.id) ? t.clear : t.all} onClick={() => toggle(record.id)}>{selected.has(record.id) ? <CheckSquare size={20} /> : <Square size={20} />}</button>
          <button className="managed-record-main" onClick={() => onOpen(record)}><span className="section-kicker">{new Date(record.startedAt).toLocaleString(uiLanguage)}</span><strong>{record.question}</strong><small>{record.turns.length} {t.answers} · {Math.round(seconds / 60)} {t.min}</small></button>
          <button className="managed-record-open" onClick={() => onOpen(record)}>{t.open}</button>
        </article>;
      })}</div>
    </> : <p className="empty-copy">{t.empty}</p>}
  </section>;
}
