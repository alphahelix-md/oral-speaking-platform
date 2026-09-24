'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Play, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import { deleteAudio, getPlaybackAudio, listAudio, type AudioLibraryEntry } from '@/core/audio/store';
import { transcribeLegacyAudio } from '@/core/audio/legacy-transcription';
import { RequestNotSentError } from '@/core/session/recovery';
import { fetchJsonWithTimeout } from '@/lib/http/fetch-json';
import { recordedAudioToWavChunks } from '@/core/audio/wav';
import { speechErrors } from '@/lib/speech/ui-copy';
import { getSupabaseAuthHeaders } from '@/lib/auth/supabase-browser';
import type { Session } from '@/types/speaking';

type UiLanguage = 'zh-CN' | 'en' | 'zh-HK' | 'ja';
type Props = { readOnly: boolean; onResume: (session: Session) => void; sessions: Session[]; uiLanguage: UiLanguage; accessCode: string; onEditAccessCode: () => void; onDeleted: (id: string) => void };

const recoveryCopy = {
  'zh-CN': { retry: '重新转写', working: '转写中', editCode: '检查访问码', unknownLanguage: '无法确定这段旧录音的语言。', copied: '已复制', copy: '复制文字' },
  en: { retry: 'Retry transcription', working: 'Transcribing', editCode: 'Check access code', unknownLanguage: 'The language of this older recording is unknown.', copied: 'Copied', copy: 'Copy transcript' },
  'zh-HK': { retry: '重新轉寫', working: '轉寫中', editCode: '檢查存取碼', unknownLanguage: '無法確定這段舊錄音的語言。', copied: '已複製', copy: '複製文字' },
  ja: { retry: '再度文字起こし', working: '文字起こし中', editCode: 'アクセスコードを確認', unknownLanguage: 'この古い録音の言語を特定できません。', copied: 'コピー済み', copy: '文字起こしをコピー' },
} satisfies Record<UiLanguage, Record<string, string>>;

const trainingStateCopy: Record<UiLanguage, { cloudSaved: string; localOnly: string; uploading: string; failed: string }> = {
  'zh-CN': { cloudSaved: '已保存到私有改进库', localOnly: '仅保存在本机', uploading: '正在上传到私有改进库', failed: '云端上传失败；本机录音仍安全' },
  en: { cloudSaved: 'Saved to private improvement library', localOnly: 'Stored on this device only', uploading: 'Uploading to private improvement library', failed: 'Cloud upload failed; local audio is safe' },
  'zh-HK': { cloudSaved: '已儲存至私人改善資料庫', localOnly: '只儲存在本機', uploading: '正在上傳至私人改善資料庫', failed: '雲端上傳失敗；本機錄音仍安全' },
  ja: { cloudSaved: '非公開の改善ライブラリに保存済み', localOnly: 'この端末内にのみ保存', uploading: '非公開の改善ライブラリへアップロード中', failed: 'クラウドへのアップロードに失敗。端末内の録音は保持されています' },
};

const privacyNoticeCopy: Record<UiLanguage, string> = {
  'zh-CN': '转写会把音频发送给当前语音服务。只有账户明确同意后，今后的录音才会上传到私有改进库；可在个人页撤回并删除云端内容。',
  en: 'Transcription sends audio to the current speech service. Future recordings upload to the private improvement library only after explicit account consent; revoke and delete cloud copies from Profile.',
  'zh-HK': '轉寫會把音訊傳送至現有語音服務。只有帳戶明確同意後，往後錄音才會上傳至私人改善資料庫；可在個人頁撤回及刪除雲端內容。',
  ja: '文字起こしでは音声を現在の音声サービスへ送信します。アカウントで明示的に同意した場合のみ今後の録音を非公開の改善ライブラリへアップロードし、プロフィールから撤回・削除できます。',
};

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

export function RecordingLibrary({ readOnly, onResume, sessions, uiLanguage, accessCode, onEditAccessCode, onDeleted }: Props) {
  const [entries, setEntries] = useState<AudioLibraryEntry[]>([]);
  const [selectedUrl, setSelectedUrl] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const transcribingLock = useRef(false);
  const [transcribingId, setTranscribingId] = useState('');
  const [transcribingProgress, setTranscribingProgress] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const t = copy[uiLanguage];
  const recovery = recoveryCopy[uiLanguage];

  useEffect(() => {
    let active = true;
    const reload = () => listAudio().then(items => {
      if (active) {
        setEntries(items.sort((a, b) => (b.metadata?.createdAt || '').localeCompare(a.metadata?.createdAt || '')));
        setLoading(false);
      }
    }).catch(() => { if (active) { setError(t.unavailable); setLoading(false); } });
    void reload();
    window.addEventListener('oral-training-upload-state', reload);
    return () => { active = false; window.removeEventListener('oral-training-upload-state', reload); };
  }, [t.unavailable]);

  useEffect(() => () => { if (selectedUrl) URL.revokeObjectURL(selectedUrl); }, [selectedUrl]);

  async function play(entry: AudioLibraryEntry) {
    try { setSelectedId(entry.id); setSelectedUrl(URL.createObjectURL(await getPlaybackAudio(entry.id) || entry.blob)); }
    catch { setError(t.unavailable); }
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
    if (readOnly || !window.confirm(t.confirmDelete)) return;
    try {
      await deleteAudio(id);
      if (selectedId === id) { setSelectedId(''); setSelectedUrl(''); }
      setEntries(items => items.filter(item => item.id !== id));
      onDeleted(id);
    } catch { setError(t.deleteFailed); }
  }

  function linkedTurn(id: string) {
    return sessions.flatMap(session => session.turns.map(turn => ({ session, turn }))).find(item => item.turn.audioId === id);
  }

  async function retryTranscription(entry: AudioLibraryEntry) {
    if (readOnly || transcribingLock.current) return;
    if (entry.metadata?.kind === 'original') {
      const owner = sessions.find(item => item.draft?.audioId === entry.id);
      if (owner) onResume(owner);
      return;
    }
    const linked = linkedTurn(entry.id);
    const language = entry.metadata?.language || linked?.session.language;
    if (!language) { setError(recovery.unknownLanguage); return; }
    if (!accessCode) { setError(speechErrors[uiLanguage].betaAccessDenied); setErrorCode('BETA_ACCESS_DENIED'); onEditAccessCode(); return; }
    let hasPartial = Boolean(entry.metadata?.transcript);
    transcribingLock.current = true;
    setError(''); setErrorCode(''); setTranscribingId(entry.id);
    try {
      const chunks = await recordedAudioToWavChunks(entry.blob, entry.metadata?.durationSeconds);
      await transcribeLegacyAudio(entry.id, chunks, async (chunk, index, requestId) => {
        setTranscribingProgress(String(index + 1) + '/' + String(chunks.length));
        const form = new FormData();
        form.append('audio', chunk, chunk.name);
        form.append('language', language);
        const { response, data } = await fetchJsonWithTimeout<{ text?: string; error?: string; requestStarted?: boolean }>('/api/transcribe', async () => ({
          method: 'POST',
          headers: { 'x-beta-access-code': accessCode, ...(await getSupabaseAuthHeaders()), 'x-speech-request-id': requestId, 'x-speech-chunk-index': String(index), 'x-oral-session-id': entry.metadata?.sessionId || linked?.session.id || entry.id },
          body: form,
        }), 60_000);
        if (!response.ok) {
          const code = String(data.error || 'TRANSCRIPTION_FAILED');
          if (data.requestStarted === false || ['AUTH_REQUIRED', 'AUTH_ACCESS_CODE_MISMATCH', 'BETA_ACCESS_DENIED', 'BETA_DAILY_LIMIT_REACHED', 'BETA_GUARD_NOT_CONFIGURED', 'INVALID_AUDIO_OR_LANGUAGE'].includes(code)) throw new RequestNotSentError(code);
          throw new Error(code);
        }
        return String(data.text || '').trim();
      }, metadata => {
        hasPartial = Boolean(metadata.transcript);
        setEntries(items => items.map(item => item.id === entry.id ? { ...item, metadata } : item));
      });
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : 'TRANSCRIPTION_FAILED';
      setErrorCode(code);
      const messages = speechErrors[uiLanguage];
      const uncertain = { 'zh-CN': '上次转写结果未确认，已停止重复请求。可播放或下载录音，已保存文字仍保留。', en: 'The previous transcription result is unknown. Repeat requests are blocked. You can play or download the recording; saved text is retained.', 'zh-HK': '上次轉寫結果未確認，已停止重複請求。可播放或下載錄音，已儲存文字仍保留。', ja: '前回の文字起こし結果が不明なため、再送信を停止しました。録音の再生・ダウンロードと保存済みテキストは利用できます。' };
      const detail = code === 'TRANSCRIPTION_UNCERTAIN' ? uncertain[uiLanguage] : code === 'BETA_ACCESS_DENIED' ? messages.betaAccessDenied : code === 'BETA_DAILY_LIMIT_REACHED' ? messages.betaDailyLimit : code === 'BETA_GUARD_NOT_CONFIGURED' ? messages.betaUnavailable : code === 'GLM_QUOTA_OR_LIMIT' ? messages.glmQuota : code === 'EMPTY_TRANSCRIPT' ? messages.emptyTranscript : messages.transcriptionFailed;
      setError(hasPartial ? messages.partialTranscript + ' ' + detail : detail);
    } finally { transcribingLock.current = false; setTranscribingId(''); setTranscribingProgress(''); }
  }

  async function copyTranscript(value: string, id: string) {
    try { await navigator.clipboard.writeText(value); setCopiedId(id); }
    catch { setError(t.unavailable); }
  }

  return <section className="recording-library">
    <div className="page-intro"><span className="section-kicker">ORAL / AUDIO</span><h1>{t.title}</h1><p>{t.intro}</p></div>
    <div className="info-note recording-privacy"><UploadCloud size={18} /><span>{privacyNoticeCopy[uiLanguage]}</span></div>
    {error && <div className="notice" role="alert">{error}{errorCode === 'BETA_ACCESS_DENIED' && <button className="recording-code-link" onClick={onEditAccessCode}>{recovery.editCode}</button>}</div>}
    {!loading && !entries.length && <p className="empty-copy recording-empty">{t.empty}</p>}
    <div className="recording-list">{entries.map(entry => {
      const linked = linkedTurn(entry.id);
      const draftSession = sessions.find(item => item.draft?.audioId === entry.id);
      const resumeLabel = uiLanguage === 'en' ? 'Resume practice' : uiLanguage === 'ja' ? '練習を再開' : uiLanguage === 'zh-HK' ? '恢復練習' : '恢复练习';
      const createdAt = entry.metadata?.createdAt || linked?.turn.createdAt;
      const question = entry.metadata?.question || linked?.turn.question || t.unknown;
      return <article className="recording-card" key={entry.id}>
        <span className="section-kicker">{createdAt ? new Date(createdAt).toLocaleString(uiLanguage) : t.unknown} · {entry.metadata?.durationSeconds || linked?.turn.durationSeconds || 0}s</span>
        <strong>{question}</strong>
        <small>{draftSession?.draft?.transcript || entry.metadata?.transcript || linked?.turn.transcript || t.pending}</small>
        <span className="recording-size">{t.size}: {(entry.blob.size / 1024 / 1024).toFixed(2)} MB</span>
        <span className="recording-size">{entry.metadata?.trainingUploadedAt ? '☁ ' + trainingStateCopy[uiLanguage].cloudSaved : entry.metadata?.trainingUploadStatus === 'pending' ? trainingStateCopy[uiLanguage].uploading : entry.metadata?.trainingUploadStatus === 'failed' ? trainingStateCopy[uiLanguage].failed : trainingStateCopy[uiLanguage].localOnly}</span>
        <div className="turn-actions">
          <button onClick={() => play(entry)}><Play size={15} /> {t.play}</button>
          <button onClick={() => download(entry)}><Download size={15} /> {t.download}</button>
          {(entry.metadata?.kind !== 'original' || draftSession) && <button onClick={() => retryTranscription(entry)} disabled={readOnly || Boolean(transcribingId)}><RotateCcw size={15} /> {entry.metadata?.kind === 'original' ? resumeLabel : transcribingId === entry.id ? recovery.working + ' ' + transcribingProgress : recovery.retry}</button>}
          <button onClick={() => remove(entry.id)} disabled={readOnly || Boolean(transcribingId)}><Trash2 size={15} /> {t.delete}</button>
        </div>
        {(entry.metadata?.transcript || linked?.turn.transcript) && <button className="recording-copy" onClick={() => copyTranscript(entry.metadata?.transcript || linked?.turn.transcript || '', entry.id)}>{copiedId === entry.id ? recovery.copied : recovery.copy}</button>}
        {selectedId === entry.id && selectedUrl && <audio controls autoPlay src={selectedUrl} className="audio-player" />}
      </article>;
    })}</div>
  </section>;
}
