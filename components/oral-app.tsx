'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, AudioLines, BarChart3, BookOpen, Check, ChevronRight, CircleHelp, Clock3, Headphones, Home, Languages, LogIn, LogOut, Mail, Mic, Moon, MoreHorizontal, Pause, Play, RotateCcw, Settings2, Sparkles, Square, Sun, Target, UserRound, Volume2, WandSparkles, X } from 'lucide-react';
import { languages } from '@/languages';
import { uiExtra, modeUi, topicUi, levelUi, scoreUi } from '@/lib/ui-translations';
import { modes } from '@/training/config';
import { createSession, speakingReducer } from '@/core/speaking/engine';
import { getSessions, getStats, saveSession } from '@/core/session/storage';
import { AudioRecorder } from '@/core/audio/recorder';
import { BrowserTranscriber, browserTranscriptionSupported } from '@/core/audio/browser-transcriber';
import { recordedAudioToWavChunks } from '@/core/audio/wav';
import { getAudio, saveAudio, updateAudioMetadata } from '@/core/audio/store';
import { RecordingLibrary } from '@/components/recording-library';
import { speechUi, speechErrors } from '@/lib/speech/ui-copy';
import { SpeechResult } from '@/components/speech-result';
import { SpeechDebugPanel, type SpeechDiagnostic } from '@/components/speech-debug-panel';
import type { AudioMetrics, TranscriptResult } from '@/lib/speech/types';
import { demoEvaluation, demoQuestion } from '@/lib/ai/demo';
import { IELTS_PART_1, IELTS_PART_2, IELTS_PART_3, ieltsPartAt, ieltsPartChangesAfter, ieltsPlan } from '@/exams/ielts/plan';
import { ieltsQuestionSets } from '@/exams/ielts/bank';
import type { LanguageId, ModeId, Session, Turn } from '@/types/speaking';
import { getSupabaseAuthHeaders, getSupabaseBrowser } from '@/lib/auth/supabase-browser';
import { deleteMyTrainingAudio, uploadTrainingAudio } from '@/lib/audio/training-upload';
import type { User } from '@supabase/supabase-js';

type Page = 'home' | 'practice' | 'setup' | 'speaking' | 'result' | 'progress' | 'profile' | 'recordings';
type UiLanguage = 'zh-CN' | 'en' | 'zh-HK' | 'ja';
type Theme = 'light' | 'dark';
type TrainingConsent = 'unset' | 'local_only' | 'training';
// Interface copy is selected independently of the language being practiced.
type TextProvider = 'openai' | 'deepseek' | 'glm';
const interfaceLanguages: { id: UiLanguage; label: string }[] = [
  { id: 'zh-CN', label: '简体中文' }, { id: 'en', label: 'English' }, { id: 'zh-HK', label: '繁體中文（香港）' }, { id: 'ja', label: '日本語' },
];
const uiCopy: Record<UiLanguage, Record<string, string>> = {
  'zh-CN': { studio: '口语工作室', settings: '界面设置', interfaceLanguage: '界面语言', appearance: '显示模式', light: '浅色模式', dark: '深色模式', close: '关闭', confirm: '确定', daily: '你的每日口语空间', voice: '找到你的声音。', further: '继续前行。', intro: '真实对话。贴心反馈。看得见的进步。', begin: '开始练习', choose: '选择学习语言', journey: '你的历程', sessions: '次练习', minutes: '分钟口语', streak: '连续练习*', home: '首页', practice: '练习', progress: '进度', profile: '我的', recordings: '我的录音', audioSaveFailed: '录音未能保存到本机；请勿刷新，先下载或重试。', settingsHint: '设置界面语言和显示模式。' },
  en: { studio: 'SPEAKING STUDIO', settings: 'Interface settings', interfaceLanguage: 'Interface language', appearance: 'Appearance', light: 'Light mode', dark: 'Dark mode', close: 'Close', confirm: 'Confirm', daily: 'YOUR DAILY SPEAKING SPACE', voice: 'Find your voice.', further: 'Go further.', intro: 'Real conversations. Thoughtful feedback. Progress you can feel.', begin: 'LET’S BEGIN', choose: 'Choose a language', journey: 'YOUR JOURNEY', sessions: 'sessions', minutes: 'minutes spoken', streak: 'streak*', home: 'Home', practice: 'Practice', progress: 'Progress', profile: 'Profile', recordings: 'My recordings', audioSaveFailed: 'Audio could not be saved on this device. Do not refresh; download or retry first.', settingsHint: 'Set interface language and appearance.' },
  'zh-HK': { studio: '口語工作室', settings: '介面設定', interfaceLanguage: '介面語言', appearance: '顯示模式', light: '淺色模式', dark: '深色模式', close: '關閉', confirm: '確定', daily: '你的每日口語空間', voice: '找到你的聲音。', further: '繼續前行。', intro: '真實對話。貼心回饋。看得見的進步。', begin: '開始練習', choose: '選擇學習語言', journey: '你的歷程', sessions: '次練習', minutes: '分鐘口語', streak: '連續練習*', home: '首頁', practice: '練習', progress: '進度', profile: '我的', recordings: '我的錄音', audioSaveFailed: '錄音未能儲存到本機；請勿重新整理，先下載或重試。', settingsHint: '設定介面語言和顯示模式。' },
  ja: { studio: 'スピーキングスタジオ', settings: '表示設定', interfaceLanguage: '表示言語', appearance: '表示モード', light: 'ライトモード', dark: 'ダークモード', close: '閉じる', confirm: '確定', daily: '毎日のスピーキング空間', voice: '声を見つけよう。', further: 'もっと先へ。', intro: 'リアルな会話。丁寧なフィードバック。実感できる進歩。', begin: '始めましょう', choose: '学習言語を選ぶ', journey: 'あなたの記録', sessions: 'セッション', minutes: '話した分数', streak: '連続記録*', home: 'ホーム', practice: '練習', progress: '進捗', profile: 'プロフィール', recordings: '録音ライブラリ', audioSaveFailed: '音声を端末に保存できませんでした。更新せずにダウンロードするか、再試行してください。', settingsHint: '表示言語とテーマを設定。' },
};
const iconMap = { ielts: BookOpen, daily: AudioLines, scenario: Target, topic: Sparkles, 'free-talk': Mic, toefl: BookOpen, interview: UserRound, weakness: Target };
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
const downloadAudioLabel: Record<UiLanguage, string> = { 'zh-CN': '下载这段录音', en: 'Download this recording', 'zh-HK': '下載這段錄音', ja: 'この録音をダウンロード' };
const accessCodeReminder: Record<UiLanguage, string> = {
  'zh-CN': '测试访问码缺失或被拒绝，服务器无法转写。请重新填写后点“重新分析”。',
  en: 'Test access code is missing or rejected. Re-enter it, then retry analysis.',
  'zh-HK': '測試存取碼缺失或遭拒，伺服器無法轉寫。請重新填寫後再分析。',
  ja: 'テストアクセスコードが未入力か拒否されました。再入力してから再分析してください。',
};
const editAccessCodeLabel: Record<UiLanguage, string> = { 'zh-CN': '填写访问码', en: 'Enter access code', 'zh-HK': '填寫存取碼', ja: 'アクセスコードを入力' };
const localRecordingDisclosure: Record<UiLanguage, string> = {
  'zh-CN': '停止录音后，原音会保存在此浏览器；转写时可能发送至语音服务。只有明确同意后，今后的录音才会上传到私有训练库。',
  en: 'Original audio is saved in this browser. Transcription may send it to a speech service. Future recordings upload to the private training library only after explicit consent.',
  'zh-HK': '停止錄音後，原音會儲存在此瀏覽器；轉寫時可能傳送至語音服務。只有明確同意後，往後錄音才會上傳至私人訓練庫。',
  ja: '録音はこのブラウザに保存され、文字起こしでは音声サービスへ送信される場合があります。明示的な同意後のみ、今後の録音を非公開の学習ライブラリへアップロードします。',
};
const authCopy: Record<UiLanguage, Record<string, string>> = {
  'zh-CN': { signIn: '邮箱登录', signOut: '退出登录', email: '邮箱地址', sendLink: '发送登录链接', checkEmail: '登录链接已发送，请查收邮箱。', emailLimited: '登录邮件发送过于频繁，请稍后重试。多人测试前建议配置自有 SMTP。', inviteOnly: '测试者可用邮箱注册；使用功能仍需测试访问码。', unavailable: '登录尚未配置。', needSignIn: '请先用邮箱登录，再在界面设置保存测试访问码。', codeMismatch: '此账户没有匹配的测试访问码；请在界面设置重新保存。', syncFailed: '访问码仅保存到本机；账户同步失败。', active: '账号已登录，访问码与授权设置可跨设备恢复。' },
  en: { signIn: 'Sign in by email', signOut: 'Sign out', email: 'Email address', sendLink: 'Send sign-in link', checkEmail: 'Sign-in link sent. Check your email.', emailLimited: 'Too many sign-in emails. Try again later. Configure custom SMTP before multi-user testing.', inviteOnly: 'Testers may register by email; a test access code is still required.', unavailable: 'Sign-in is not configured yet.', needSignIn: 'Sign in by email, then save the test access code in Interface settings.', codeMismatch: 'This account has no matching test access code. Save it again in Interface settings.', syncFailed: 'Access code saved only on this device; account sync failed.', active: 'Signed in. Access-code and consent settings restore across devices.' },
  'zh-HK': { signIn: '電郵登入', signOut: '登出', email: '電郵地址', sendLink: '傳送登入連結', checkEmail: '登入連結已傳送，請查看電郵。', emailLimited: '登入郵件傳送過於頻繁，請稍後再試。多人測試前建議設定自訂 SMTP。', inviteOnly: '測試者可用電郵註冊；使用功能仍需測試存取碼。', unavailable: '登入尚未設定。', needSignIn: '請先用電郵登入，再在介面設定儲存測試存取碼。', codeMismatch: '此帳戶沒有相符的測試存取碼；請在介面設定重新儲存。', syncFailed: '存取碼只儲存在此裝置；帳戶同步失敗。', active: '帳戶已登入，存取碼與授權設定可跨裝置復原。' },
  ja: { signIn: 'メールでログイン', signOut: 'ログアウト', email: 'メールアドレス', sendLink: 'ログインリンクを送信', checkEmail: 'ログインリンクを送信しました。メールを確認してください。', emailLimited: 'ログインメールの送信回数が多すぎます。後でもう一度お試しください。複数人でのテスト前に独自 SMTP を設定してください。', inviteOnly: 'テスターはメールで登録できます。利用にはテストアクセスコードが必要です。', unavailable: 'ログインはまだ設定されていません。', needSignIn: 'メールでログインしてから、表示設定でテストアクセスコードを保存してください。', codeMismatch: 'このアカウントには一致するテストアクセスコードがありません。表示設定で保存し直してください。', syncFailed: 'アクセスコードはこの端末にのみ保存されました。アカウント同期に失敗しました。', active: 'ログイン済み。アクセスコードと同意設定は端末間で復元されます。' },
};
const consentCopy: Record<UiLanguage, Record<string, string>> = {
  'zh-CN': { title: '录音使用授权', body: '练习录音始终先保存在本机。请选择是否允许把今后的录音上传到私有训练库，用于改进口语反馈。', local: '仅用于练习', localHint: '不上传训练库；转写仍会发送给当前语音服务。', training: '同意用于改进', trainingHint: '仅上传今后的录音；不公开展示，可随时撤回并删除已上传内容。', saved: '授权设置已保存。', uploadFailed: '练习已保存，但训练音频上传失败。', revokeFailed: '授权已停止，但云端旧音频删除失败，请稍后重试。', section: '录音与模型改进', statusLocal: '仅本机练习，不上传训练库', statusTraining: '已同意上传今后的录音，可随时撤回', change: '修改授权' },
  en: { title: 'Audio-use consent', body: 'Practice audio is always saved locally first. Choose whether future recordings may also be uploaded to a private training library to improve speaking feedback.', local: 'Practice only', localHint: 'No training upload. Transcription still sends audio to the current speech service.', training: 'Allow improvement use', trainingHint: 'Only future recordings upload. Nothing is public; revoke anytime and delete uploaded audio.', saved: 'Consent preference saved.', uploadFailed: 'Practice saved, but training-audio upload failed.', revokeFailed: 'Future uploads stopped, but older cloud audio could not be deleted. Retry later.', section: 'Audio and model improvement', statusLocal: 'Local practice only; no training upload', statusTraining: 'Future uploads allowed; you can revoke anytime', change: 'Change consent' },
  'zh-HK': { title: '錄音使用授權', body: '練習錄音一律先儲存在本機。請選擇是否允許把往後錄音上傳至私人訓練庫，用於改善口語回饋。', local: '只用於練習', localHint: '不上傳訓練庫；轉寫仍會傳送至現有語音服務。', training: '同意用於改善', trainingHint: '只上傳往後錄音；不公開展示，可隨時撤回及刪除已上傳內容。', saved: '授權設定已儲存。', uploadFailed: '練習已儲存，但訓練音訊上傳失敗。', revokeFailed: '已停止往後上傳，但舊雲端音訊刪除失敗，請稍後重試。', section: '錄音與模型改善', statusLocal: '只作本機練習，不上傳訓練庫', statusTraining: '已同意上傳往後錄音，可隨時撤回', change: '修改授權' },
  ja: { title: '録音利用の同意', body: '練習音声は必ず端末内に保存されます。今後の録音を非公開の学習ライブラリへアップロードし、会話フィードバック改善に利用するか選択してください。', local: '練習のみ', localHint: '学習用にはアップロードしません。文字起こしでは現在の音声サービスへ送信されます。', training: '改善利用に同意', trainingHint: '今後の録音のみアップロードします。公開せず、いつでも撤回・削除できます。', saved: '同意設定を保存しました。', uploadFailed: '練習は保存されましたが、学習音声をアップロードできませんでした。', revokeFailed: '今後のアップロードは停止しましたが、以前のクラウド音声を削除できませんでした。後で再試行してください。', section: '録音とモデル改善', statusLocal: '端末内の練習のみ。学習用アップロードなし', statusTraining: '今後のアップロードに同意済み。いつでも撤回可能', change: '同意を変更' },
};

export function OralApp() {
  const [page, setPage] = useState<Page>('home'); const [language, setLanguage] = useState<LanguageId>('en'); const [mode, setMode] = useState<ModeId>('daily'); const [level, setLevel] = useState('Intermediate'); const [topic, setTopic] = useState('Everyday life');
  const [session, setSession] = useState<Session | null>(null); const [sessions, setSessions] = useState<Session[]>([]); const [retryExamPart, setRetryExamPart] = useState<1 | 2 | 3 | undefined>(); const [recording, setRecording] = useState(false); const [paused, setPaused] = useState(false); const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null); const [audioUrl, setAudioUrl] = useState(''); const [transcript, setTranscript] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [tab, setTab] = useState<'all' | LanguageId>('all');
  const [pendingAudioId, setPendingAudioId] = useState<string | null>(null); const [audioSaveFailed, setAudioSaveFailed] = useState(false);
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('en'); const [theme, setTheme] = useState<Theme>('light'); const [settingsOpen, setSettingsOpen] = useState(false); const [draftUiLanguage, setDraftUiLanguage] = useState<UiLanguage>('en'); const [draftTheme, setDraftTheme] = useState<Theme>('light'); const [textProvider, setTextProvider] = useState<TextProvider>('deepseek'); const [accessCode, setAccessCode] = useState(''); const [draftTextProvider, setDraftTextProvider] = useState<TextProvider>('deepseek'); const [draftAccessCode, setDraftAccessCode] = useState('');
  const [authOpen, setAuthOpen] = useState(false); const [authUser, setAuthUser] = useState<User | null>(null); const [authEmail, setAuthEmail] = useState(''); const [authBusy, setAuthBusy] = useState(false); const [authNotice, setAuthNotice] = useState('');
  const [trainingConsent, setTrainingConsent] = useState<TrainingConsent>('unset'); const [consentOpen, setConsentOpen] = useState(false); const [consentBusy, setConsentBusy] = useState(false);
  const recorder = useRef<AudioRecorder | null>(null); const browserTranscriber = useRef<BrowserTranscriber | null>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingLock = useRef(false); const stopLock = useRef(false); const analysisLock = useRef(false); const submitLock = useRef(false); const evaluationLock = useRef(false);
  const transcriptionProgress = useRef<{ blob: Blob; parts: string[] } | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics | null>(null); const [transcriptResult, setTranscriptResult] = useState<TranscriptResult | null>(null); const [processingStage, setProcessingStage] = useState('');
  const [speechDiagnostic, setSpeechDiagnostic] = useState<SpeechDiagnostic>({}); const speechRequestId = useRef(''); const speechRequestCount = useRef(0);
  useEffect(() => { setSessions(getSessions()); }, []);
  useEffect(() => { const savedLanguage = localStorage.getItem('oral-ui-language') as UiLanguage | null; const savedTheme = localStorage.getItem('oral-theme') as Theme | null; if (savedLanguage && uiCopy[savedLanguage]) setUiLanguage(savedLanguage); if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme); }, []);
  useEffect(() => { setAccessCode(sessionStorage.getItem('oral-beta-access-code') || ''); }, []);
  useEffect(() => { const saved = localStorage.getItem('oral-text-provider'); if (saved === 'deepseek' || saved === 'glm') setTextProvider(saved); }, []);
  useEffect(() => { localStorage.setItem('oral-text-provider', textProvider); }, [textProvider]);
  useEffect(() => { document.documentElement.lang = uiLanguage; document.title = `Oral — ${uiCopy[uiLanguage].studio}`; document.documentElement.dataset.theme = theme; localStorage.setItem('oral-ui-language', uiLanguage); localStorage.setItem('oral-theme', theme); }, [uiLanguage, theme]);
  useEffect(() => { if (accessCode) sessionStorage.setItem('oral-beta-access-code', accessCode); else sessionStorage.removeItem('oral-beta-access-code'); }, [accessCode]);
  useEffect(() => {
    const client = getSupabaseBrowser();
    if (!client) return;
    const applyUser = (user: User | null) => {
      setAuthUser(user);
      if (!user) { setAccessCode(''); setTrainingConsent('unset'); return; }
      const savedCode = user.user_metadata?.oral_beta_access_code;
      if (typeof savedCode === 'string') setAccessCode(savedCode);
      const savedConsent = user.user_metadata?.oral_training_consent;
      setTrainingConsent(savedConsent === 'training' || savedConsent === 'local_only' ? savedConsent : 'unset');
    };
    client.auth.getUser().then(({ data }) => applyUser(data.user));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => applyUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) { saveSession(session); setSessions(getSessions()); } }, [session]);
  useEffect(() => { return () => { if (timer.current) clearInterval(timer.current); recorder.current?.dispose(); }; }, []);
  useEffect(() => { if (page !== 'speaking' && recorder.current?.state !== 'inactive') { recorder.current?.dispose(); if (timer.current) clearInterval(timer.current); setRecording(false); setPaused(false); } }, [page]);
  useEffect(() => { if (!audio) { setAudioUrl(''); return; } const url = URL.createObjectURL(audio); setAudioUrl(url); return () => URL.revokeObjectURL(url); }, [audio]);
  const config = languages[language]; const activeMode = modes[mode]; const sessionTurnLimit = mode === 'ielts' ? ieltsPlan(topic).length : activeMode.maxTurns; const stats = getStats(sessions); const currentStats = getStats(sessions, tab === 'all' ? undefined : tab); const text = uiCopy[uiLanguage]; const extra = uiExtra[uiLanguage]; const voice = speechUi[uiLanguage]; const modeText = (id: ModeId) => modeUi[uiLanguage][id] || modes[id]; const studyName = (id: LanguageId) => id === 'en' ? extra.english : extra.japanese; const dateLocale = uiLanguage === 'zh-HK' ? 'zh-HK' : uiLanguage; const shownEvaluation = session?.evaluation?.model === 'demo' ? demoEvaluation(session.language, session.turns, uiLanguage) : session?.evaluation; const topicLabel = (value: string) => topicUi[uiLanguage][value] || value; const ieltsStageLabel = (part: 1 | 2 | 3) => topicLabel(part === 1 ? IELTS_PART_1 : part === 2 ? IELTS_PART_2 : IELTS_PART_3);
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, oralPage: 'home', oralSettings: false }, '');
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { oralPage?: Page; oralSettings?: boolean } | null;
      setPage(state?.oralPage || 'home');
      setSettingsOpen(Boolean(state?.oralSettings));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  function navigate(next: Page) {
    if (next === page) return;
    window.history.pushState({ oralPage: next, oralSettings: false }, '');
    setPage(next);
  }
  function goBack() {
    if (page !== 'home' && window.history.state?.oralPage) window.history.back();
    else navigate('home');
  }
  function openSettings() {
    setDraftUiLanguage(uiLanguage);
    setDraftTheme(theme);
    setDraftTextProvider(textProvider);
    setDraftAccessCode(accessCode);
    window.history.pushState({ oralPage: page, oralSettings: true }, '');
    setSettingsOpen(true);
  }
  function closeSettings() {
    if (window.history.state?.oralSettings) window.history.back();
    else setSettingsOpen(false);
  }
  async function confirmSettings() {
    setUiLanguage(draftUiLanguage);
    setTheme(draftTheme);
    setTextProvider(draftTextProvider);
    setAccessCode(draftAccessCode);
    const client = getSupabaseBrowser();
    if (client && authUser) {
      const { error } = await client.auth.updateUser({ data: { oral_beta_access_code: draftAccessCode.trim() } });
      if (error) setNotice(authCopy[draftUiLanguage].syncFailed);
    }
    closeSettings();
  }
  async function sendSignInLink() {
    const client = getSupabaseBrowser();
    if (!client) { setAuthNotice(authCopy[uiLanguage].unavailable); return; }
    setAuthBusy(true); setAuthNotice('');
    const { error } = await client.auth.signInWithOtp({ email: authEmail.trim(), options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } });
    setAuthBusy(false);
    setAuthNotice(error ? (/rate limit/i.test(error.message) ? authCopy[uiLanguage].emailLimited : error.message) : authCopy[uiLanguage].checkEmail);
  }
  async function signOut() {
    await getSupabaseBrowser()?.auth.signOut();
    setAccessCode('');
    setAuthOpen(false);
  }
  async function saveTrainingConsent(next: Exclude<TrainingConsent, 'unset'>, startAfter = false) {
    const client = getSupabaseBrowser();
    if (!client || !authUser || consentBusy) return;
    setConsentBusy(true);
    const allowed = next === 'training';
    const previousAllowed = trainingConsent === 'training';
    const { error: consentError } = await client.from('training_audio_consents').upsert({
      user_id: authUser.id,
      allowed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (consentError) { setConsentBusy(false); setNotice(consentError.message); return; }
    const { error } = await client.auth.updateUser({ data: { oral_training_consent: next, oral_training_consent_updated_at: new Date().toISOString() } });
    if (error) {
      await client.from('training_audio_consents').upsert({
        user_id: authUser.id,
        allowed: previousAllowed,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      setConsentBusy(false);
      setNotice(error.message);
      return;
    }
    let cleanupFailed = false;
    if (trainingConsent === 'training' && next === 'local_only') {
      try { await deleteMyTrainingAudio(); } catch { cleanupFailed = true; }
    }
    setConsentBusy(false);
    setTrainingConsent(next);
    setConsentOpen(false);
    setNotice(cleanupFailed ? consentCopy[uiLanguage].revokeFailed : consentCopy[uiLanguage].saved);
    if (startAfter) await startRecordingNow();
  }
  function chooseLanguage(id: LanguageId) { setLanguage(id); setLevel(id === 'ja' ? 'Beginner' : 'Intermediate'); setMode('daily'); setTopic(languages[id].topics.daily[0]); navigate('practice'); }
  function chooseMode(id: ModeId) { if (!modes[id].enabled) return; setMode(id); setTopic(config.topics[id]?.[0] || config.topics.daily[0]); navigate('setup'); }
  function startSession() {
    const priorIelts = sessions.filter(item => item.mode === 'ielts').length;
    const questionSet = mode === 'ielts' ? ieltsQuestionSets[priorIelts % ieltsQuestionSets.length] : undefined;
    const question = demoQuestion(language, mode, 0, topic, questionSet?.id);
    const created = createSession(language, mode, level, topic, question);
    setSession(questionSet ? { ...created, examSetId: questionSet.id } : created);
    setTranscript('');
    setAudio(null); setAudioMetrics(null); setTranscriptResult(null); setPendingAudioId(null); setAudioSaveFailed(false);
    setSeconds(0);
    setNotice('');
    setRetryExamPart(undefined);
    navigate('speaking');
  }
  function speakQuestion() { if (!('speechSynthesis' in window) || !session) return; speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(session.question); utterance.lang = languages[session.language].speechLocale; utterance.rate = session.language === 'ja' && session.level === 'Beginner' ? 0.83 : 0.95; speechSynthesis.speak(utterance); }
  async function beginRecording() {
    if (authUser && trainingConsent === 'unset') { setConsentOpen(true); return; }
    await startRecordingNow();
  }
  async function startRecordingNow() {
    if (recordingLock.current || analysisLock.current) return;
    recordingLock.current = true;
    speechRequestId.current = '';
    speechRequestCount.current = 0;
    setSpeechDiagnostic({
      browser: navigator.userAgent,
      mediaRecorderSupported: typeof MediaRecorder !== 'undefined',
      supportedFormats: typeof MediaRecorder !== 'undefined' ? (['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].filter(type => MediaRecorder.isTypeSupported(type)).join(', ') || 'browser default') : 'unsupported',
      uploadStatus: 'not started',
      requestCount: 0,
    });
    setNotice('');
    setProcessingStage(voice.permission);
    try {
      const next = new AudioRecorder(language);
      await next.start();
      recorder.current = next;
      setAudio(null); setAudioMetrics(null); setTranscriptResult(null); setTranscript(''); setSeconds(0); setPendingAudioId(null); setAudioSaveFailed(false); transcriptionProgress.current = null;
      const freeTranscriber = new BrowserTranscriber();
      browserTranscriber.current = freeTranscriber;
      const freeStarted = browserTranscriptionSupported() && freeTranscriber.start(language, text => { setTranscript(text); setTranscriptResult({ text, language, provider: 'browser-speech-recognition' }); });
      if (freeStarted) setProcessingStage(voice.transcribing); else setNotice(extra.transcription);
      setRecording(true); setPaused(false);
      setSession(s => s && speakingReducer(s, { type: 'STATUS', status: 'recording' }));
      timer.current = setInterval(() => setSeconds(n => n + 1), 1000);
    } catch (error) {
      setNotice(error instanceof DOMException && error.name === 'NotAllowedError' ? extra.micUnavailable : extra.recordFailed);
      setSpeechDiagnostic(previous => ({ ...previous, errorCode: error instanceof Error ? error.name : 'RECORDING_START_FAILED' }));
    } finally { setProcessingStage(''); recordingLock.current = false; }
  }
  function togglePause() { if (!recorder.current) return; if (paused) recorder.current.resume(); else recorder.current.pause(); setPaused(!paused); }
  async function analyzeAudio(blob: Blob) {
    if (analysisLock.current) return;
    analysisLock.current = true; setBusy(true); setProcessingStage(voice.transcribing);
    const parts = transcriptionProgress.current?.blob === blob ? [...transcriptionProgress.current.parts] : [];
    transcriptionProgress.current = { blob, parts };
    const requestId = speechRequestId.current || `sp_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    speechRequestId.current = requestId;
    setSpeechDiagnostic(previous => ({ ...previous, requestId, uploadStatus: 'converting audio' }));
    try {
      const chunks = await recordedAudioToWavChunks(blob);
      if (!chunks.length) throw new Error('EMPTY_AUDIO');
      for (const [index, chunk] of chunks.entries()) {
        if (index in parts) continue;
        speechRequestCount.current += 1;
        const form = new FormData();
        form.append('audio', chunk, chunk.name); form.append('language', language);
        setSpeechDiagnostic(previous => ({ ...previous, fileName: chunk.name, fileMime: chunk.type, fileSize: chunk.size, formField: 'audio', requestUrl: '/api/transcribe', requestCount: speechRequestCount.current, uploadStatus: 'uploading' }));
        if (process.env.NEXT_PUBLIC_SPEECH_DEBUG === 'true') console.info('[SPEECH_UPLOAD]', { requestId, chunkIndex: index, fileName: chunk.name, fileType: chunk.type, fileSize: chunk.size, formFields: Array.from(form.keys()) });
        const started = performance.now();
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { ...(accessCode ? { 'x-beta-access-code': accessCode } : {}), ...(await getSupabaseAuthHeaders()), 'x-speech-request-id': requestId, 'x-speech-chunk-index': String(index) },
          body: form,
        });
        const duration = Math.round(performance.now() - started);
        setSpeechDiagnostic(previous => ({ ...previous, httpStatus: response.status, requestDurationMs: duration, uploadStatus: response.ok ? 'server responded' : 'server rejected' }));
        const data = await response.json();
        setSpeechDiagnostic(previous => ({ ...previous, serverReceived: Boolean(data.received), serverFileSize: data.received?.fileSize, serverMime: data.received?.mimeType, provider: data.provider, errorCode: data.error, requestId: data.requestId || requestId }));
        if (process.env.NEXT_PUBLIC_SPEECH_DEBUG === 'true') console.info('[SPEECH_RESPONSE]', { requestId, chunkIndex: index, httpStatus: response.status, durationMs: duration, errorCode: data.error, serverReceived: Boolean(data.received) });
        if (!response.ok) throw new Error(String(data.error || 'TRANSCRIPTION_FAILED'));
        parts[index] = String(data.text || '').trim();
        transcriptionProgress.current = { blob, parts: [...parts] };
        setTranscript(parts.filter(Boolean).join(' '));
      }
      const text = parts.join(' ').trim();
      if (!text) throw new Error('EMPTY_TRANSCRIPT');
      setTranscript(text); setTranscriptResult({ text, language, provider: 'glm' }); setNotice('');
      setSpeechDiagnostic(previous => ({ ...previous, uploadStatus: 'complete', errorCode: undefined }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'TRANSCRIPTION_FAILED';
      setSpeechDiagnostic(previous => ({ ...previous, uploadStatus: 'error', errorCode: reason }));
      const detail = reason === 'AUTH_REQUIRED' ? authCopy[uiLanguage].needSignIn : reason === 'AUTH_ACCESS_CODE_MISMATCH' ? authCopy[uiLanguage].codeMismatch : reason === 'BETA_DAILY_LIMIT_REACHED' ? speechErrors[uiLanguage].betaDailyLimit : reason === 'BETA_ACCESS_DENIED' ? speechErrors[uiLanguage].betaAccessDenied : reason === 'BETA_GUARD_NOT_CONFIGURED' ? speechErrors[uiLanguage].betaUnavailable : reason === 'GLM_NOT_CONFIGURED' ? speechErrors[uiLanguage].glmMissing : reason === 'GLM_KEY_INVALID' ? speechErrors[uiLanguage].glmInvalid : reason === 'GLM_QUOTA_OR_LIMIT' ? speechErrors[uiLanguage].glmQuota : reason === 'EMPTY_TRANSCRIPT' ? speechErrors[uiLanguage].emptyTranscript : speechErrors[uiLanguage].transcriptionFailed;
      setNotice(parts.some(Boolean) ? `${speechErrors[uiLanguage].partialTranscript} ${detail}` : detail);
    } finally {
      analysisLock.current = false; setBusy(false); setProcessingStage('');
      setSession(s => s && speakingReducer(s, { type: 'STATUS', status: 'listening' }));
    }
  }
  async function finishRecording() {
    if (!recorder.current || stopLock.current || analysisLock.current || !recording) return;
    stopLock.current = true;
    speechRequestId.current = `sp_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    setSpeechDiagnostic(previous => ({ ...previous, requestId: speechRequestId.current, uploadStatus: 'recording stopped' }));
    if (timer.current) clearInterval(timer.current);
    setRecording(false); setPaused(false); setBusy(true); setProcessingStage(voice.analyzing);
    setSession(s => s && speakingReducer(s, { type: 'STATUS', status: 'processing' }));
    try {
      const result = await recorder.current.stop();
      recorder.current = null;
      const freeText = await browserTranscriber.current?.stop() || '';
      browserTranscriber.current = null;
      setSpeechDiagnostic(previous => ({ ...previous, recordedMime: result.blob.type, blobSize: result.blob.size, durationSeconds: result.metrics.durationSeconds }));
      if (process.env.NEXT_PUBLIC_SPEECH_DEBUG === 'true') console.info('[SPEECH_BLOB]', { requestId: speechRequestId.current, blobSize: result.blob.size, blobType: result.blob.type, duration: result.metrics.durationSeconds });
      if (result.blob.size === 0) { setNotice(voice.empty); return; }
      setAudio(result.blob); setAudioMetrics(result.metrics); setSeconds(result.seconds);
      const audioId = crypto.randomUUID();
      try {
        await saveAudio(audioId, result.blob, { createdAt: new Date().toISOString(), language, mode, question: session?.question, durationSeconds: result.seconds, sessionId: session?.id });
        setPendingAudioId(audioId);
        setAudioSaveFailed(false);
      } catch {
        setPendingAudioId(null);
        setAudioSaveFailed(true);
      }
      if (result.metrics.durationSeconds < 0.8) { setNotice(voice.short); return; }
      if (freeText) {
        setTranscript(freeText);
        setTranscriptResult({ text: freeText, language, provider: 'browser-speech-recognition' });
        setSpeechDiagnostic(previous => ({ ...previous, provider: 'browser-speech-recognition', uploadStatus: 'not needed' }));
      } else await analyzeAudio(result.blob);
    } catch (error) {
      setNotice(extra.recordFailed);
      setSpeechDiagnostic(previous => ({ ...previous, errorCode: error instanceof Error ? error.name : 'RECORDING_STOP_FAILED' }));
    } finally {
      stopLock.current = false; setBusy(false); setProcessingStage('');
      setSession(s => s && speakingReducer(s, { type: 'STATUS', status: 'listening' }));
    }
  }
  async function submitAnswer() {
    if (!session || !transcript.trim() || busy || submitLock.current) return; submitLock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const audioId = audio ? pendingAudioId || crypto.randomUUID() : undefined;
      if (audioId && audio && !pendingAudioId) await saveAudio(audioId, audio, { createdAt: new Date().toISOString(), language, mode, question: session.question, durationSeconds: seconds, sessionId: session.id });
      const updated = speakingReducer(session, { type: 'ANSWER', transcript: transcript.trim(), audioId, durationSeconds: seconds, audioMetrics: audioMetrics || undefined, transcriptResult: transcriptResult || undefined, examPart: mode === 'ielts' ? retryExamPart || ieltsPartAt(topic, session.turns.length) : undefined });
      if (audioId) await updateAudioMetadata(audioId, { turnId: updated.turns[updated.turns.length - 1]?.id, transcript: transcript.trim() });
      if (audioId && audio && authUser && trainingConsent === 'training') {
        try {
          const path = await uploadTrainingAudio({ id: audioId, audio, language, mode, question: session.question, transcript: transcript.trim(), durationSeconds: seconds });
          await updateAudioMetadata(audioId, { trainingConsent: true, trainingStoragePath: path, trainingUploadedAt: new Date().toISOString() });
        } catch (error) {
          const code = error instanceof Error ? error.message : 'TRAINING_UPLOAD_UNKNOWN';
          setNotice(`${consentCopy[uiLanguage].uploadFailed} [${code}]`);
        }
      }
      setSession(updated);
      setAudio(null); setAudioMetrics(null); setTranscriptResult(null); setPendingAudioId(null); setAudioSaveFailed(false);
      setTranscript('');
      setSeconds(0);
      if (updated.turns.length >= sessionTurnLimit) {
        await finishSession(updated);
        return;
      }
      let question = demoQuestion(language, mode, updated.turns.length, topic, session.examSetId);
      if (mode === 'ielts' && ieltsPartChangesAfter(topic, updated.turns.length)) {
        setSession(s => s && speakingReducer(s, { type: 'QUESTION', question }));
        return;
      }
      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessCode ? { 'x-beta-access-code': accessCode } : {}), ...(await getSupabaseAuthHeaders()) },
          body: JSON.stringify({ action: 'next', provider: textProvider, language, mode, level, topic, questionSetId: session.examSetId, turns: updated.turns }),
        });
        const data = await response.json();
        if (response.ok && data.question) question = data.question;
        else if (data.error !== 'AI_NOT_CONFIGURED') setNotice(extra.unavailable);
      } catch {
        setNotice(extra.offline);
      }
      setSession(s => s && speakingReducer(s, { type: 'QUESTION', question }));
    } catch {
      setNotice(extra.saveFailed);
    } finally {
      setBusy(false); submitLock.current = false;
    }
  }
  async function finishSession(current: Session | null = session) { if (!current || evaluationLock.current || busy && current === session) return; evaluationLock.current = true; setBusy(true); setProcessingStage(voice.evaluating); setNotice(''); let evaluation = demoEvaluation(current.language, current.turns, uiLanguage); try { if (current.turns.length) { try { const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessCode ? { 'x-beta-access-code': accessCode } : {}), ...(await getSupabaseAuthHeaders()) }, body: JSON.stringify({ action: 'evaluate', provider: textProvider, uiLanguage, language: current.language, mode: current.mode, level: current.level, topic: current.topic, turns: current.turns }) }); const data = await response.json(); if (response.ok && data.evaluation) evaluation = data.evaluation; else if (data.error !== 'AI_NOT_CONFIGURED') setNotice(extra.demoFeedback); } catch { setNotice(extra.demoOffline); } } const done = speakingReducer(current, { type: 'EVALUATE', evaluation }); setSession(done); saveSession(done); navigate('result'); } finally { setBusy(false); setProcessingStage(''); evaluationLock.current = false; } }
  function retry(turn: Turn) { if (!session) return; setSession(s => s && speakingReducer(s, { type: 'RETRY', turnId: turn.id })); setTranscript(''); setAudio(null); setAudioMetrics(null); setTranscriptResult(null); setPendingAudioId(null); setAudioSaveFailed(false); setSeconds(0); setNotice(extra.sameQuestion); setRetryExamPart(mode === 'ielts' ? turn.examPart || ieltsPartAt(topic, Math.max(0, session.turns.findIndex(item => item.id === turn.id))) : undefined); navigate('speaking'); }
  async function playAudio(id: string) { const blob = await getAudio(id); if (!blob) { setNotice(extra.audioMissing); return; } const url = URL.createObjectURL(blob); const player = new Audio(url); player.onended = () => URL.revokeObjectURL(url); player.play().catch(() => setNotice(extra.playback)); }
  function openSession(item: Session) { setSession(item); setLanguage(item.language); setMode(item.mode); setLevel(item.level); setTopic(item.topic); setRetryExamPart(undefined); navigate(item.evaluation ? 'result' : 'speaking'); }
  function recordingDeleted(id: string) {
    for (const item of getSessions()) {
      if (item.turns.some(turn => turn.audioId === id)) saveSession({ ...item, turns: item.turns.map(turn => turn.audioId === id ? { ...turn, audioId: undefined } : turn) });
    }
    setSessions(getSessions());
    setSession(current => current && ({ ...current, turns: current.turns.map(turn => turn.audioId === id ? { ...turn, audioId: undefined } : turn) }));
    if (pendingAudioId === id) { setPendingAudioId(null); setAudio(null); }
  }

  return <div className="app-shell"><div className="app-frame">
    {page !== 'speaking' && page !== 'result' && <header className="topbar"><div className="brand"><span className="brand-mark"><AudioLines size={20} strokeWidth={2.5} /></span><span>oral<span className="brand-dot">.</span></span></div><div className="topbar-tools"><span className="topbar-caption">{text.studio}</span><button className="auth-button" aria-label={authUser ? authCopy[uiLanguage].signOut : authCopy[uiLanguage].signIn} onClick={() => setAuthOpen(true)}>{authUser ? (authUser.email?.slice(0, 1).toUpperCase() || <UserRound size={17} />) : <LogIn size={17} />}</button><button className="settings-button" aria-label={text.settings} onClick={openSettings}><Settings2 size={18} /></button></div></header>}
    {authOpen && <div className="settings-backdrop" role="presentation" onClick={() => setAuthOpen(false)}><section className="auth-sheet" role="dialog" aria-modal="true" aria-label={authCopy[uiLanguage].signIn} onClick={event => event.stopPropagation()}><button className="settings-close auth-close" aria-label={text.close} onClick={() => setAuthOpen(false)}><X size={19} /></button>{authUser ? <><span className="section-kicker">ORAL ACCOUNT</span><h2>{authUser.email}</h2><p>{authCopy[uiLanguage].inviteOnly}</p><button className="primary-button" onClick={signOut}>{authCopy[uiLanguage].signOut} <LogOut size={19} /></button></> : <><span className="section-kicker">ORAL ACCOUNT</span><h2>{authCopy[uiLanguage].signIn}</h2><p>{authCopy[uiLanguage].inviteOnly}</p><label className="access-code-label" htmlFor="auth-email">{authCopy[uiLanguage].email}</label><input id="auth-email" className="access-code-input" type="email" value={authEmail} onChange={event => setAuthEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" /><button className="primary-button" disabled={authBusy || !authEmail.trim()} onClick={sendSignInLink}>{authBusy ? extra.processing : authCopy[uiLanguage].sendLink} <Mail size={19} /></button>{authNotice && <p className="auth-notice">{authNotice}</p>}</>}</section></div>}
    {consentOpen && <div className="settings-backdrop" role="presentation"><section className="auth-sheet consent-sheet" role="dialog" aria-modal="true" aria-label={consentCopy[uiLanguage].title}><button className="settings-close auth-close" aria-label={text.close} onClick={() => setConsentOpen(false)}><X size={19} /></button><span className="section-kicker">PRIVACY</span><h2>{consentCopy[uiLanguage].title}</h2><p>{consentCopy[uiLanguage].body}</p><div className="consent-options"><button disabled={consentBusy} onClick={() => saveTrainingConsent('local_only', page === 'speaking')}><strong>{consentCopy[uiLanguage].local}</strong><small>{consentCopy[uiLanguage].localHint}</small></button><button disabled={consentBusy} onClick={() => saveTrainingConsent('training', page === 'speaking')}><strong>{consentCopy[uiLanguage].training}</strong><small>{consentCopy[uiLanguage].trainingHint}</small></button></div></section></div>}
    {settingsOpen && <div className="settings-backdrop" role="presentation" onClick={closeSettings}>
      <section className="settings-sheet" role="dialog" aria-modal="true" aria-label={uiCopy[draftUiLanguage].settings} onClick={event => event.stopPropagation()}>
        <div className="settings-head"><div><span className="section-kicker">ORAL</span><h2>{uiCopy[draftUiLanguage].settings}</h2><p>{uiCopy[draftUiLanguage].settingsHint}</p></div><button className="settings-close" aria-label={uiCopy[draftUiLanguage].close} onClick={closeSettings}><X size={19} /></button></div>
        <div className="settings-scroll">
          <div className="preference-module"><div className="module-title"><Languages size={18} /><span>{uiCopy[draftUiLanguage].interfaceLanguage}</span></div><div className="language-options">{interfaceLanguages.map(item => <button key={item.id} className={draftUiLanguage === item.id ? 'selected' : ''} onClick={() => setDraftUiLanguage(item.id)}>{item.label}<Check size={16} /></button>)}</div></div>
          <div className="preference-module"><div className="module-title"><Sparkles size={18} /><span>{uiExtra[draftUiLanguage].provider}</span></div><div className="provider-options">{(['openai', 'deepseek', 'glm'] as const).map(provider => <button key={provider} className={draftTextProvider === provider ? 'selected' : ''} onClick={() => setDraftTextProvider(provider)}>{provider === 'glm' ? 'GLM' : provider === 'openai' ? 'OpenAI' : 'DeepSeek'}<Check size={16} /></button>)}</div><p className="provider-note">{uiExtra[draftUiLanguage].providerNote.replace('OpenAI', 'GLM')}</p><label className="access-code-label" htmlFor="beta-access-code">{uiExtra[draftUiLanguage].accessCode}</label><input id="beta-access-code" className="access-code-input" value={draftAccessCode} onChange={event => setDraftAccessCode(event.target.value)} autoComplete="off" /></div>
          <div className="preference-module"><div className="module-title"><Sun size={18} /><span>{uiCopy[draftUiLanguage].appearance}</span></div><div className="theme-options"><button className={draftTheme === 'light' ? 'selected' : ''} onClick={() => setDraftTheme('light')}><span className="theme-swatch light-swatch"><i /><i /><i /><i /><i /></span><span>{uiCopy[draftUiLanguage].light}</span><Sun size={16} /></button><button className={draftTheme === 'dark' ? 'selected' : ''} onClick={() => setDraftTheme('dark')}><span className="theme-swatch dark-swatch"><i /><i /><i /><i /><i /></span><span>{uiCopy[draftUiLanguage].dark}</span><Moon size={16} /></button></div></div>
        </div>
        <div className="settings-footer"><button className="primary-button" onClick={confirmSettings}>{uiCopy[draftUiLanguage].confirm} <Check size={19} /></button></div>
      </section>
    </div>}
    <main className={`main-content ${page === 'speaking' || page === 'result' ? 'full-height' : ''}`}>
      {(page === 'progress' || page === 'profile' || page === 'recordings') && <button className="text-back" onClick={goBack}><ArrowLeft size={18} /> {extra.back}</button>}
      {page === 'speaking' && audioSaveFailed && <div className="notice" role="alert">{text.audioSaveFailed}{audioUrl && <a className="unsaved-download" href={audioUrl} download={`oral-unsaved.${audio?.type.includes('mp4') ? 'm4a' : audio?.type.includes('ogg') ? 'ogg' : 'webm'}`}>{downloadAudioLabel[uiLanguage]}</a>}</div>}
      {page === 'speaking' && (!accessCode || speechDiagnostic.errorCode === 'BETA_ACCESS_DENIED') && <div className="notice access-code-reminder" role="status">{accessCodeReminder[uiLanguage]} <button type="button" onClick={openSettings}>{editAccessCodeLabel[uiLanguage]}</button></div>}
      {page === 'home' && <><div className="hero"><div className="eyebrow"><span className="live-dot" /> {text.daily}</div><h1>{text.voice}<br /><em>{text.further}</em></h1><p>{text.intro}</p><div className="hero-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><AudioLines size={56} strokeWidth={1.5} /></div></div><div className="section-head"><div><span className="section-kicker">{text.begin}</span><h2>{text.choose}</h2></div><span className="section-number">01 / 02</span></div><div className="language-list">{(['en', 'ja'] as const).map(id => <button className={`language-card ${id}`} key={id} onClick={() => chooseLanguage(id)}><span className="language-symbol">{languages[id].flag}</span><span className="language-copy"><strong>{studyName(id)} <span className="native-name">{id === 'ja' && uiLanguage !== 'ja' ? '日本語' : ''}</span></strong><small>{id === 'en' ? extra.enLearn : extra.jaLearn}</small></span><span className="round-arrow"><ArrowRight size={19} /></span></button>)}</div><div className="quick-stats"><div><span>{text.journey}</span><strong>{stats.sessions.toString().padStart(2, '0')}</strong><small>{text.sessions}</small></div><div><span>&nbsp;</span><strong>{stats.minutes.toString().padStart(2, '0')}</strong><small>{text.minutes}</small></div><div><span>&nbsp;</span><strong>—</strong><small>{text.streak}</small></div></div><p className="fine-print">* {extra.streakNote}</p>{sessions.length > 0 && <><div className="section-head compact"><h2>{extra.resume}</h2></div><button className="recent-card" onClick={() => openSession(sessions[0])}><span className="recent-icon">{languages[sessions[0].language].flag}</span><span><strong>{modeText(sessions[0].mode).title}</strong><small>{new Date(sessions[0].startedAt).toLocaleDateString(dateLocale)} · {sessions[0].turns.length} {extra.answers}</small></span><ChevronRight size={18} /></button></>}</>}
      {page === 'practice' && <><button className="text-back" onClick={goBack}><ArrowLeft size={18} /> {extra.back}</button><div className="page-intro"><span className="section-kicker">{config.flag} / {config.nativeName.toUpperCase()}</span><h1>{extra.today}<br /><em>{extra.todayEm}</em></h1><p>{extra.chooseSpace}</p></div><div className="language-switch"><button className={language === 'en' ? 'selected' : ''} onClick={() => chooseLanguage('en')}>{extra.english}</button><button className={language === 'ja' ? 'selected' : ''} onClick={() => chooseLanguage('ja')}>{extra.japanese}</button></div><div className="mode-list">{config.modes.map(id => { const item = modes[id]; const Icon = iconMap[id]; return <button key={id} disabled={!item.enabled} className={`mode-card ${!item.enabled ? 'disabled' : ''}`} onClick={() => chooseMode(id)}><span className="mode-icon"><Icon size={23} strokeWidth={1.8} /></span><span className="mode-copy"><strong>{modeText(id).title}</strong><small>{modeText(id).short}</small></span>{item.enabled ? <ChevronRight size={19} /> : <span className="soon">{extra.soon}</span>}</button>; })}</div>{language === 'ja' && <div className="info-note"><CircleHelp size={18} /><span>{extra.jlptNote}</span></div>}</>}
      {page === 'setup' && <><button className="text-back" onClick={goBack}><ArrowLeft size={18} /> {extra.back}</button><div className="page-intro"><span className="section-kicker">{extra.personalize}</span><h1>{extra.makeMoment}<br /><em>{extra.momentEm}</em></h1><p>{extra.choices}</p></div><div className="setup-panel"><div className="setup-mode"><span className="mode-icon"><Settings2 size={22} /></span><span><small>{extra.selected}</small><strong>{modeText(mode).title}</strong></span></div><label className="field-label" htmlFor="level">{extra.level}</label><select id="level" value={level} onChange={e => setLevel(e.target.value)}>{config.levels.map(item => <option key={item} value={item}>{levelUi[uiLanguage][item] || item}</option>)}</select><label className="field-label" htmlFor="topic">{extra.focus}</label><select id="topic" value={topic} onChange={e => setTopic(e.target.value)}>{(config.topics[mode] || config.topics.daily).map(item => <option key={item} value={item}>{topicLabel(item)}</option>)}</select><div className="session-details"><span><Clock3 size={16} /> {extra.minutesRange}</span><span><Mic size={16} /> {extra.voiceFirst}</span></div></div><div className="info-note"><Sparkles size={18} /><span>{modeText(mode).description}</span></div><button className="primary-button" onClick={startSession}>{extra.start} <ArrowRight size={19} /></button><p className="center-note">{extra.micNote}</p></>}
      {page === 'speaking' && session && <><div className="session-top"><button className="icon-button" aria-label={extra.back} onClick={goBack}><ArrowLeft size={20} /></button><span className="session-title">{studyName(language)} <span>/</span> {modeText(mode).title}</span><button className="finish-link" disabled={busy || recording} onClick={() => finishSession()}>{extra.finish}</button></div><div className="session-progress"><span style={{ width: `${Math.min(100, (session.turns.length / sessionTurnLimit) * 100)}%` }} /></div><div className="speaking-body"><div className="partner-badge"><span className="avatar"><AudioLines size={30} /></span><div><strong>{modeText(mode).role}</strong><small><span className="live-dot" /> {processingStage || (busy ? extra.thinking : recording ? extra.listening : extra.ready)}</small></div></div><div className="question-card"><span className="question-label">{mode === 'ielts' ? ieltsStageLabel(retryExamPart || ieltsPartAt(topic, session.turns.length)) : topicLabel(topic)} <span>·</span> {extra.question} {session.turns.length + 1}</span><h2>{session.question}</h2><button className="listen-button" onClick={speakQuestion}><Volume2 size={17} /> {extra.listenQuestion}</button></div><div className="answer-zone"><span className="section-kicker">{extra.response}</span>{recording ? <><div className="recording-indicator"><span className="pulse-dot" /> {paused ? extra.paused : extra.recording} <strong>{formatTime(seconds)}</strong></div><div className="recorder-controls"><button className="pause-button" onClick={togglePause}>{paused ? <Play size={18} /> : <Pause size={18} />}{paused ? extra.resumeRecording : extra.pause}</button><button className="stop-button" onClick={finishRecording}><Square size={17} fill="currentColor" /> {extra.finishAnswer}</button></div></> : <><button className="mic-button" onClick={beginRecording} disabled={busy} aria-label={extra.startRecording}><Mic size={38} strokeWidth={1.7} /></button><span className="mic-caption">{extra.tapStart}</span></>}{audioUrl && <audio className="audio-player" controls src={audioUrl} />}{audio && audioMetrics?.analysisAvailable && !recording && <div className="info-note pause-preview" role="status"><Clock3 size={18} /><div><strong>{voice.longPauses}: {audioMetrics.longPauseCount}</strong>{(audioMetrics.longPauseIntervals || []).length > 0 && <ol>{audioMetrics.longPauseIntervals.map((pause, index) => <li key={`${pause.startSeconds}-${pause.endSeconds}`}>{index + 1}. {pause.startSeconds.toFixed(1)}–{pause.endSeconds.toFixed(1)} {voice.seconds}（{voice.pauseDuration} {pause.durationSeconds.toFixed(1)} {voice.seconds}）</li>)}</ol>}<small>{voice.sourceNote}</small></div></div>}{audio && !recording && !busy && !transcriptResult && <button className="pause-button" onClick={() => analyzeAudio(audio)}>{voice.retryAnalysis}</button>}{!recording && <><label className="transcript-label" htmlFor="transcript" >{extra.transcript} {audio ? <span>· {extra.review}</span> : <span>· {extra.typePractice}</span>}</label><textarea id="transcript" value={transcript} onChange={e => setTranscript(e.target.value)} rows={3} placeholder={extra.placeholder} /><button className="primary-button submit-button" disabled={!transcript.trim() || busy} onClick={submitAnswer}>{busy ? extra.processing : extra.continue} <ArrowRight size={19} /></button></>}</div><SpeechDebugPanel diagnostic={speechDiagnostic} />{notice && <div className="notice" role="status">{notice}</div>}{session.turns.length > 0 && <div className="session-count">{session.turns.length} {extra.answers} {extra.saved} · {extra.upTo} {sessionTurnLimit} {extra.turns}</div>}</div></>}
      {page === 'result' && session && <><div className="session-top"><button className="icon-button" aria-label={extra.back} onClick={goBack}><ArrowLeft size={20} /></button><span className="session-title">{extra.sessionReview}</span><span className="finish-link muted">{config.flag}</span></div><div className="result-intro"><span className="complete-icon"><Check size={27} /></span><span className="section-kicker">{extra.complete}</span><h1>{extra.everyWord}<br /><em>{extra.counts}</em></h1><p>{session.turns.length} {extra.answers} · {formatTime(session.turns.reduce((n, t) => n + t.durationSeconds, 0))} {extra.speakingTime}</p></div><div className="feedback-card"><div className="feedback-head"><span className="section-kicker">{voice.content}</span><WandSparkles size={19} /><strong>{shownEvaluation?.model === 'ai' ? extra.aiFeedback : extra.demoReview}</strong></div><p>{shownEvaluation?.summary || extra.noReview}</p>{shownEvaluation?.scores?.length ? <div className="score-list">{shownEvaluation.scores.map(score => <div key={score.key}><div className="score-heading"><span>{scoreUi[uiLanguage][score.key] || score.label}</span><strong>{score.value.toFixed(1)} / 10</strong></div><div className="score-track"><span style={{ width: `${score.value * 10}%` }} /></div><small>{score.note}</small></div>)}</div> : <p className="feedback-disclaimer">{extra.noScore}</p>}{shownEvaluation?.improvements?.length ? <div className="improve-block"><strong>{extra.nextFocus}</strong>{shownEvaluation.improvements.map((item, index) => <p key={index}>{item}</p>)}</div> : null}</div><SpeechResult turns={session.turns} uiLanguage={uiLanguage} /><div className="section-head compact"><h2>{extra.yourAnswers}</h2><span className="section-number">{session.turns.length.toString().padStart(2, '0')}</span></div><div className="turn-list">{session.turns.map((turn, index) => <div className="turn-card" key={turn.id}><div className="turn-meta"><span>{mode === 'ielts' && <>{ieltsStageLabel(turn.examPart || ieltsPartAt(topic, index))} · </>}{extra.answer} {index + 1} · {extra.attempt} {turn.attempt}</span><span>{formatTime(turn.durationSeconds)}</span></div><strong>{turn.question}</strong><p>{turn.transcript}</p><div className="turn-actions">{turn.audioId && <button onClick={() => playAudio(turn.audioId!)}><Play size={15} /> {extra.playAudio}</button>}<button onClick={() => retry(turn)}><RotateCcw size={15} /> {extra.retry}</button></div></div>)}</div>{notice && <div className="notice" role="status">{notice}</div>}<button className="primary-button" onClick={() => navigate('practice')}>{extra.practiceAgain} <ArrowRight size={19} /></button></>}
      {page === 'progress' && <><div className="page-intro progress-intro"><span className="section-kicker">{extra.bigPicture}</span><h1>{extra.seeProgress}<br /><em>{extra.progressEm}</em></h1><p>{extra.confidence}</p></div><div className="language-switch three"><button className={tab === 'all' ? 'selected' : ''} onClick={() => setTab('all')}>{extra.overall}</button><button className={tab === 'en' ? 'selected' : ''} onClick={() => setTab('en')}>{extra.english}</button><button className={tab === 'ja' ? 'selected' : ''} onClick={() => setTab('ja')}>{extra.japanese}</button></div><div className="progress-grid"><div><Clock3 size={20} /><strong>{currentStats.minutes}</strong><span>{extra.minutesSpoken}</span></div><div><AudioLines size={20} /><strong>{currentStats.sessions}</strong><span>{extra.sessionCount}</span></div><div><BarChart3 size={20} /><strong>{currentStats.average === null ? '—' : currentStats.average}</strong><span>{extra.aiAverage}</span></div></div><div className="section-head compact"><h2>{extra.focusAreas}</h2></div>{currentStats.weaknesses.length ? <div className="chip-list">{currentStats.weaknesses.map(item => <span key={item}>{item}</span>)}</div> : <div className="empty-state"><Target size={25} /><strong>{extra.noFocus}</strong><p>{extra.focusHint}</p></div>}<div className="section-head compact"><h2>{extra.recent}</h2></div>{sessions.filter(s => tab === 'all' || s.language === tab).length ? sessions.filter(s => tab === 'all' || s.language === tab).slice(0, 8).map(item => <button className="recent-card" key={item.id} onClick={() => openSession(item)}><span className="recent-icon">{languages[item.language].flag}</span><span><strong>{modeText(item.mode).title}</strong><small>{new Date(item.startedAt).toLocaleDateString(dateLocale)} · {item.turns.length} {extra.answers}</small></span><ChevronRight size={18} /></button>) : <p className="empty-copy">{extra.firstSession}</p>}</>}
      {page === 'profile' && <><div className="page-intro"><span className="section-kicker">{extra.yourSpace}</span><h1>{extra.personal}<br /><em>{extra.personalEm}</em></h1><p>{extra.localProfile}</p></div><div className="profile-card"><span className="profile-avatar"><UserRound size={28} /></span><div><strong>{authUser?.email || extra.guest}</strong><small>{authUser ? authCopy[uiLanguage].active : extra.noAccount}</small></div></div>{authUser && <section className="consent-status"><div><strong>{consentCopy[uiLanguage].section}</strong><small>{trainingConsent === 'training' ? consentCopy[uiLanguage].statusTraining : consentCopy[uiLanguage].statusLocal}</small></div><button onClick={() => setConsentOpen(true)}>{consentCopy[uiLanguage].change}</button></section>}<div className="section-head compact"><h2>{extra.languageProfiles}</h2></div>{(['en', 'ja'] as const).map(id => <div className="profile-language" key={id}><span className="recent-icon">{languages[id].flag}</span><span><strong>{studyName(id)}</strong><small>{getStats(sessions, id).sessions} {extra.deviceSessions}</small></span></div>)}<div className="info-note"><CircleHelp size={18} /><span>{extra.historyNote}</span></div><div className="section-head compact"><h2>{extra.about}</h2></div><p className="about-copy">{extra.aboutCopy}</p></>}
      {page === 'profile' && <button className="recent-card recording-entry" onClick={() => navigate('recordings')}><span className="recent-icon"><AudioLines size={21} /></span><span><strong>{text.recordings}</strong><small>{extra.historyNote}</small></span><ChevronRight size={18} /></button>}
      {page === 'recordings' && <RecordingLibrary sessions={sessions} uiLanguage={uiLanguage} accessCode={accessCode} onEditAccessCode={openSettings} onDeleted={recordingDeleted} />}
      {page === 'setup' && <p className="center-note recording-disclosure">{localRecordingDisclosure[uiLanguage]}</p>}
    </main>
    {page !== 'speaking' && page !== 'result' && <nav className="bottom-nav" aria-label={extra.navigation}>{([{ id: 'home', label: text.home, Icon: Home }, { id: 'practice', label: text.practice, Icon: Headphones }, { id: 'progress', label: text.progress, Icon: BarChart3 }, { id: 'profile', label: text.profile, Icon: UserRound }] as const).map(item => <button key={item.id} onClick={() => navigate(item.id)} className={page === item.id || page === 'setup' && item.id === 'practice' ? 'active' : ''}><item.Icon size={21} strokeWidth={1.8} /><span>{item.label}</span></button>)}</nav>}
  </div></div>;
}
