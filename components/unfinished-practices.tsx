import { ChevronRight, FolderOpen } from 'lucide-react';
import type { Session } from '@/types/speaking';

type UiLanguage = 'zh-CN' | 'en' | 'zh-HK' | 'ja';
const copy = {
  'zh-CN': { title: '未完成练习', hint: '查看并继续已保存的练习', intro: '选择一项，接着上次的题目和草稿继续。', empty: '暂无未完成练习。', answers: '个回答', audio: '有录音草稿', text: '有文字草稿', pending: '等待继续', en: '英语', ja: '日语' },
  en: { title: 'Unfinished practice', hint: 'View and resume saved practice', intro: 'Choose a practice to continue with its saved question and draft.', empty: 'No unfinished practice.', answers: 'answers', audio: 'Audio draft', text: 'Text draft', pending: 'Ready to continue', en: 'English', ja: 'Japanese' },
  'zh-HK': { title: '未完成練習', hint: '查看並繼續已儲存的練習', intro: '選擇一項，接著上次的題目和草稿繼續。', empty: '暫無未完成練習。', answers: '個回答', audio: '有錄音草稿', text: '有文字草稿', pending: '等待繼續', en: '英語', ja: '日語' },
  ja: { title: '未完了の練習', hint: '保存した練習を確認して再開', intro: '練習を選ぶと、保存した質問と下書きから再開できます。', empty: '未完了の練習はありません。', answers: '回答', audio: '音声の下書きあり', text: '文字の下書きあり', pending: '再開できます', en: '英語', ja: '日本語' },
};

export function UnfinishedPracticeEntry({ count, uiLanguage, disabled, onOpen }: {
  count: number; uiLanguage: UiLanguage; disabled: boolean; onOpen: () => void;
}) {
  if (!count) return null;
  const t = copy[uiLanguage];
  return <button className="unfinished-entry" disabled={disabled} onClick={onOpen}>
    <span className="unfinished-entry-icon"><FolderOpen size={21} /></span>
    <span className="unfinished-entry-copy"><strong>{t.title}</strong><small>{t.hint}</small></span>
    <span className="unfinished-count">{count}</span><ChevronRight size={18} aria-hidden="true" />
  </button>;
}

export function UnfinishedPracticeList({ sessions, uiLanguage, disabled, onResume }: {
  sessions: Session[]; uiLanguage: UiLanguage; disabled: boolean; onResume: (session: Session) => void;
}) {
  const t = copy[uiLanguage];
  return <section className="unfinished-practices">
    <div className="page-intro"><span className="section-kicker">ORAL / PRACTICE</span><h1>{t.title} <span className="unfinished-count">{sessions.length}</span></h1><p>{t.intro}</p></div>
    {sessions.length ? <div className="unfinished-list">{sessions.map(item => <button className="unfinished-card" key={item.id} disabled={disabled} onClick={() => onResume(item)}>
      <span className="unfinished-card-copy"><small>{t[item.language]} · {new Date(item.startedAt).toLocaleDateString(uiLanguage)} · {item.turns.length} {t.answers}</small><strong>{item.question}</strong><span>{item.draft?.audioId ? t.audio : item.draft?.transcript.trim() ? t.text : t.pending}</span></span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>)}</div> : <p className="empty-copy">{t.empty}</p>}
  </section>;
}
