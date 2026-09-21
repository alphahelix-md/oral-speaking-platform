'use client';

import { CalendarDays, Flame, MessageCircleMore, Timer } from 'lucide-react';
import { activityLevel, buildProgressDays, getStreaks } from '@/core/session/progress';
import type { Session } from '@/types/speaking';

type UiLanguage = 'zh-CN' | 'en' | 'zh-HK' | 'ja';
type Props = { sessions: Session[]; language?: Session['language']; uiLanguage: UiLanguage; onManage: () => void };

const copy = {
  'zh-CN': { title: '学习节奏', heatmap: '最近 12 周学习热力图', less: '少', more: '多', trend: '近 14 天口语时长', manage: '管理学习记录', minutes: '累计口语', answers: '已完成回答', streak: '当前连续', days: '活跃天数', empty: '完成一次语音回答后，这里会显示你的真实学习轨迹。', min: '分钟', day: '天', answer: '个回答', today: '今天' },
  en: { title: 'Learning rhythm', heatmap: 'Your last 12 weeks', less: 'Less', more: 'More', trend: 'Speaking time · last 14 days', manage: 'Manage learning records', minutes: 'spoken total', answers: 'answers completed', streak: 'current streak', days: 'active days', empty: 'Finish a spoken answer to see your real learning activity here.', min: 'min', day: 'days', answer: 'answers', today: 'Today' },
  'zh-HK': { title: '學習節奏', heatmap: '最近 12 星期學習熱力圖', less: '少', more: '多', trend: '最近 14 天口語時長', manage: '管理學習記錄', minutes: '累計口語', answers: '已完成回答', streak: '目前連續', days: '活躍日數', empty: '完成一次語音回答後，這裏會顯示你的真實學習軌跡。', min: '分鐘', day: '日', answer: '個回答', today: '今天' },
  ja: { title: '学習リズム', heatmap: '直近12週間の学習ヒートマップ', less: '少', more: '多', trend: '直近14日間の発話時間', manage: '学習記録を管理', minutes: '合計発話', answers: '完了した回答', streak: '現在の連続', days: '活動日数', empty: '音声で回答を完了すると、実際の学習記録がここに表示されます。', min: '分', day: '日', answer: '回答', today: '今日' },
} satisfies Record<UiLanguage, Record<string, string>>;

function linePoints(values: number[]): string {
  const max = Math.max(...values, 1);
  return values.map((value, index) => {
    const x = values.length === 1 ? 0 : index / (values.length - 1) * 100;
    const y = 100 - value / max * 82 - 9;
    return x + ',' + y;
  }).join(' ');
}

export function LearningProgressDashboard({ sessions, language, uiLanguage, onManage }: Props) {
  const t = copy[uiLanguage];
  const days = buildProgressDays(sessions, 84, language);
  const trend = days.slice(-14);
  const streaks = getStreaks(days);
  const seconds = days.reduce((total, day) => total + day.seconds, 0);
  const answers = days.reduce((total, day) => total + day.answers, 0);
  const hasActivity = answers > 0;
  const columns = Array.from({ length: 12 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const labels = [trend[0]?.date.slice(5).replace('-', '/'), trend[6]?.date.slice(5).replace('-', '/'), t.today];
  const maxTrend = Math.max(...trend.map(day => day.minutes), 1);

  return <section className="learning-dashboard">
    <div className="section-head compact"><div><span className="section-kicker">ORAL / PROGRESS</span><h2>{t.title}</h2></div><button className="manage-records-link" onClick={onManage}>{t.manage}</button></div>
    {!hasActivity ? <div className="empty-state progress-empty"><CalendarDays size={25} /><strong>{t.empty}</strong></div> : <>
      <div className="progress-detail-grid">
        <div><Timer size={17} /><strong>{Math.round(seconds / 60)}</strong><span>{t.minutes}</span></div>
        <div><MessageCircleMore size={17} /><strong>{answers}</strong><span>{t.answers}</span></div>
        <div><Flame size={17} /><strong>{streaks.current}</strong><span>{t.streak}</span></div>
        <div><CalendarDays size={17} /><strong>{streaks.activeDays}</strong><span>{t.days}</span></div>
      </div>
      <article className="progress-panel">
        <div className="progress-panel-head"><strong>{t.heatmap}</strong><span>{t.less} <i className="activity-dot level-1" /> <i className="activity-dot level-2" /> <i className="activity-dot level-3" /> <i className="activity-dot level-4" /> {t.more}</span></div>
        <div className="activity-heatmap" aria-label={t.heatmap}>{columns.map((week, weekIndex) => <div className="activity-week" key={weekIndex}>{week.map(day => <span key={day.date} className={'activity-dot level-' + activityLevel(day)} title={day.date + ': ' + day.minutes + ' ' + t.min + ', ' + day.answers + ' ' + t.answer} aria-label={day.date + ': ' + day.minutes + ' ' + t.min + ', ' + day.answers + ' ' + t.answer} />)}</div>)}</div>
      </article>
      <article className="progress-panel trend-panel">
        <div className="progress-panel-head"><strong>{t.trend}</strong><span>{Math.round(trend.reduce((total, day) => total + day.seconds, 0) / 60)} {t.min}</span></div>
        <svg className="progress-line-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={t.trend}>
          <line x1="0" y1="91" x2="100" y2="91" />
          <line x1="0" y1="50" x2="100" y2="50" />
          <polyline points={linePoints(trend.map(day => day.minutes))} />
          {trend.map((day, index) => <circle key={day.date} cx={trend.length === 1 ? 0 : index / (trend.length - 1) * 100} cy={100 - day.minutes / maxTrend * 82 - 9} r="1.8" />)}
        </svg>
        <div className="trend-labels"><span>{labels[0]}</span><span>{labels[1]}</span><span>{labels[2]}</span></div>
      </article>
    </>}
  </section>;
}
