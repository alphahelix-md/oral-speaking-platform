'use client';

import { useEffect, useState } from 'react';
import { Download, Play, Trash2, UploadCloud } from 'lucide-react';
import { deleteAudio, listAudio, type AudioLibraryEntry } from '@/core/audio/store';
import type { Session } from '@/types/speaking';

type UiLanguage = 'zh-CN' | 'en' | 'zh-HK' | 'ja';
type Props = { sessions: Session[]; uiLanguage: UiLanguage; onDeleted: (id: string) => void };

const copy = {
  'zh-CN': { title: '我的录音', intro: '原始录音保存在当前浏览器。可回放或下载备份。', empty: '还没有录音。完成一次语音回答后会显示在这里。', play: '播放', download: '下载', delete: '删除', confirmDelete: '确定永久删除这段本地录音吗？此操作无法撤销。', unavailable: '录音库暂时无法读取。', deleteFailed: '删除失败，请重试。', upload: '上传录音用于训练（尚未开放）', privacy: '语音转写会发送音频给现有转写服务；录音库不会自动上传音频用于训练。未来训练将单独征求同意。', unknown: '未关联的录音', pending: '尚未提交的回答', size: '文件大小' },
  en: { title: 'My recordings', intro: 'Original audio stays in this browser. Replay or download a backup.', empty: 'No recordings yet. Finish a spoken answer to see it here.', play: 'Play', download: 'Download', delete: 'Delete', confirmDelete: 'Permanently delete this local recording? This cannot be undone.', unavailable: 'Recording library is temporarily unavailable.', deleteFailed: 'Could not delete. Please try again.', upload: 'Upload for training (not available yet)', privacy: 'Transcription sends audio to the current speech service. The library never uploads audio for training automatically; training will require separate consent.', unknown: 'Unlinked recording', pending: 'Answer not submitted', size: 'File size' },
  'zh-HK': { title: '我的錄音', intro: '原始錄音儲存在此瀏覽器，可重播或下載備份。', empty: '暫時沒有錄音。完成語音回答後會顯示在這裏。', play: '播放', download: '下載', delete: '刪除', confirmDelete: '確定永久刪除這段本機錄音？此操作無法復原。', unavailable: '暫時無法讀取錄音庫。', deleteFailed: '刪除失敗，請重試。', upload: '上傳錄音作訓練（尚未開放）', privacy: '語音轉寫會傳送音訊至現有轉寫服務；錄音庫不會自動上傳音訊作訓練。日後訓練會另行徵求同意。', unknown: '未關聯的錄音', pending: '尚未提交的回答', size: '檔案大小' },
  ja: { title: '録音ライブラリ', intro: '元の音声はこのブラウザに保存されます。再生やダウンロードができます。', empty: '録音はまだありません。音声で回答するとここに表示されます。', play: '再生', download: 'ダウンロード', delete: '削除', confirmDelete: 'この端末の録音を完全に削除しますか？元に戻せません。', unavailable: '録音ライブラリを読み込めません。', deleteFailed: '削除できませんでした。もう一度お試しください。', upload: '学習用にアップロード（準備中）', privacy: '文字起こしでは音声を現在の音声サービスに送信します。ライブラリの音声を学習用に自動アップロードすることはなく、別途同意を求めます。', unknown: '関連付けのない録音', pending: '未送信の回答', size: 'ファイルサイズ' },
} satisfies Record<UiLanguage, Record<string, string>>;

function extension(type: string): string {
  if (type.includes('mp4')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  return 'webm';
}

export function RecordingLibrary({ sessions, uiLanguage, onDeleted }: Props) {
  const [entries, setEntries] = useState<AudioLibraryEntry[]>([]);
  const [selectedUrl, setSelectedUrl] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const t = copy[uiLanguage];

  useEffect(() => {
    let active = true;
    listAudio().then(items => {
      if (active) {
        setEntries(items.sort((a, b) => (b.metadata?.createdAt || '').localeCompare(a.metadata?.createdAt || '')));
        setLoading(false);
      }
    }).catch(() => { if (active) { setError(t.unavailable); setLoading(false); } });
    return () => { active = false; };
  }, [t.unavailable]);

  useEffect(() => () => { if (selectedUrl) URL.revokeObjectURL(selectedUrl); }, [selectedUrl]);

  function play(entry: AudioLibraryEntry) {
    setSelectedId(entry.id);
    setSelectedUrl(URL.createObjectURL(entry.blob));
  }

  function download(entry: AudioLibraryEntry) {
    const url = URL.createObjectURL(entry.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `oral-recording-${entry.metadata?.createdAt?.slice(0, 10) || 'backup'}-${entry.id.slice(0, 8)}.${extension(entry.blob.type)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function remove(id: string) {
    if (!window.confirm(t.confirmDelete)) return;
    try {
      await deleteAudio(id);
      if (selectedId === id) { setSelectedId(''); setSelectedUrl(''); }
      setEntries(items => items.filter(item => item.id !== id));
      onDeleted(id);
    } catch { setError(t.deleteFailed); }
  }

  return <section className="recording-library">
    <div className="page-intro"><span className="section-kicker">ORAL / AUDIO</span><h1>{t.title}</h1><p>{t.intro}</p></div>
    <div className="info-note recording-privacy"><UploadCloud size={18} /><span>{t.privacy}</span></div>
    <button className="recording-upload" disabled><UploadCloud size={17} /> {t.upload}</button>
    {error && <div className="notice" role="alert">{error}</div>}
    {!loading && !entries.length && <p className="empty-copy recording-empty">{t.empty}</p>}
    <div className="recording-list">{entries.map(entry => {
      const linked = sessions.flatMap(session => session.turns.map(turn => ({ session, turn }))).find(item => item.turn.audioId === entry.id);
      const createdAt = entry.metadata?.createdAt || linked?.turn.createdAt;
      const question = entry.metadata?.question || linked?.turn.question || t.unknown;
      return <article className="recording-card" key={entry.id}>
        <span className="section-kicker">{createdAt ? new Date(createdAt).toLocaleString(uiLanguage) : t.unknown} · {entry.metadata?.durationSeconds || linked?.turn.durationSeconds || 0}s</span>
        <strong>{question}</strong>
        <small>{entry.metadata?.transcript || linked?.turn.transcript || t.pending}</small>
        <span className="recording-size">{t.size}: {(entry.blob.size / 1024 / 1024).toFixed(2)} MB</span>
        <div className="turn-actions">
          <button onClick={() => play(entry)}><Play size={15} /> {t.play}</button>
          <button onClick={() => download(entry)}><Download size={15} /> {t.download}</button>
          <button onClick={() => remove(entry.id)}><Trash2 size={15} /> {t.delete}</button>
        </div>
        {selectedId === entry.id && selectedUrl && <audio controls autoPlay src={selectedUrl} className="audio-player" />}
      </article>;
    })}</div>
  </section>;
}
