import type { Turn } from '@/types/speaking';
import type { UiLanguage } from '@/lib/ui-translations';
import { speechUi } from '@/lib/speech/ui-copy';
import { combineEvaluation } from '@/lib/speech/combined-evaluator';

export function SpeechResult({ turns, uiLanguage }: { turns: Turn[]; uiLanguage: UiLanguage }) {
  const copy = speechUi[uiLanguage];
  const audioTurns = turns.filter(turn => turn.audioMetrics);
  const combined = combineEvaluation(null, turns);
  return <div className="speech-result">
    <section className="feedback-card"><div className="feedback-head"><strong>{copy.delivery}</strong></div>
      <p className="feedback-disclaimer">{copy.sourceNote}</p>
      {combined.delivery.kind === 'basic_estimate' && <p className="feedback-disclaimer">{copy.combinedBasis}</p>}
      {combined.delivery.kind === 'basic_estimate' ? audioTurns.map(turn => {
        const metrics = turn.audioMetrics!;
        const prior = turns.filter(item => item.question === turn.question && item.attempt < turn.attempt && item.audioMetrics).at(-1);
        return <div className="speech-metric-item" key={turn.id}>
          <strong>{turn.attempt}. {turn.question}</strong>
          {metrics.analysisAvailable ? <p>{copy.duration}: {metrics.durationSeconds.toFixed(1)}s · {copy.speaking}: {metrics.speakingDurationSeconds.toFixed(1)}s · {copy.silence}: {(metrics.silenceRatio * 100).toFixed(0)}% · {copy.pauses}: {metrics.pauseCount} · {copy.longPauses}: {metrics.longPauseCount}</p> : <p>{copy.noMetrics}</p>}
          {(metrics.longPauseIntervals || []).length > 0 && <ol className="pause-interval-list">{metrics.longPauseIntervals.map((pause, index) => <li key={`${pause.startSeconds}-${pause.endSeconds}`}>{index + 1}. {pause.startSeconds.toFixed(1)}–{pause.endSeconds.toFixed(1)} {copy.seconds}（{copy.pauseDuration} {pause.durationSeconds.toFixed(1)} {copy.seconds}）</li>)}</ol>}
          {prior && <p>{copy.comparison}: {copy.moreWords} {turn.transcript.length - prior.transcript.length >= 0 ? '+' : ''}{turn.transcript.length - prior.transcript.length}; {copy.pauseChange} {metrics.longPauseCount - prior.audioMetrics!.longPauseCount >= 0 ? '+' : ''}{metrics.longPauseCount - prior.audioMetrics!.longPauseCount}</p>}
        </div>;
      }) : <p>{copy.noMetrics}</p>}
    </section>
    <section className="feedback-card"><div className="feedback-head"><strong>{copy.pronunciation}</strong></div><p>{copy.unavailable}</p></section>
  </div>;
}
