'use client';

import { useMemo } from 'react';
import { Sparkles, TrendingUp, TriangleAlert, Users2 } from 'lucide-react';

import { Badge, Card, CardHeader, StatBar, StatTile } from '@/components/ui';
import { enhanceCard, enhanceCurve, upgradeOdds } from '@/lib/players/enhance';
import { MAX_GRADE } from '@/lib/players/value';
import type { Formation } from '@/lib/squad/formations';
import { rateSquad, type SquadEntry } from '@/lib/squad/rating';
import { useSquadStore } from '@/lib/squad/store';
import { formatBP, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/** 선택된 카드의 강화 단계 조절 + 가치 시뮬레이션 */
function EnhancePanel({ slotId }: { slotId: string }) {
  const entry = useSquadStore((state) => state.assignments[slotId]);
  const setGrade = useSquadStore((state) => state.setGrade);

  const curve = useMemo(() => (entry ? enhanceCurve(entry.card) : []), [entry]);

  if (!entry) return null;

  const current = enhanceCard(entry.card, entry.grade);
  const odds = upgradeOdds(1, entry.grade);
  const maxValue = curve[curve.length - 1]?.value ?? 1;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <TrendingUp size={14} className="text-neon-amber" /> 강화 시뮬레이션
          </span>
        }
        description={`${entry.card.name} · ${entry.card.seasonName}`}
      />

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="num w-10 shrink-0 text-center text-2xl font-black text-neon-amber">
            +{entry.grade}
          </span>
          <input
            type="range"
            min={1}
            max={MAX_GRADE}
            step={1}
            value={entry.grade}
            onChange={(event) => setGrade(slotId, Number(event.target.value))}
            aria-label="강화 단계"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-neon-amber"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatTile label="오버롤" value={current.ovr} sub={`기본 ${entry.card.ovr}`} />
          <StatTile
            label="추정 가치"
            value={`${formatBP(current.value)}`}
            sub="BP"
            tone="good"
          />
          <StatTile
            label="+1→현재 성공률"
            value={formatPercent(odds.straightRate, 1)}
            sub={`기대 시도 ${odds.expectedAttempts.toFixed(1)}회`}
            tone={odds.straightRate < 0.05 ? 'bad' : 'neutral'}
          />
        </div>

        <div className="space-y-1.5">
          {(['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'] as const).map(
            (key) => (
              <StatBar
                key={key}
                label={
                  { pace: '속도', shooting: '슛', passing: '패스', dribbling: '드리블', defending: '수비', physical: '피지컬' }[key]
                }
                value={current.stats[key]}
              />
            ),
          )}
        </div>

        {/* 강화 단계별 가치 곡선 */}
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            강화 단계별 추정 가치
          </p>
          <div className="flex h-16 items-end gap-1">
            {curve.map((step) => (
              <button
                key={step.grade}
                type="button"
                onClick={() => setGrade(slotId, step.grade)}
                title={`+${step.grade} · OVR ${step.ovr} · ${formatBP(step.value)} BP`}
                className={cn(
                  'group relative flex-1 rounded-t transition-colors',
                  step.grade === entry.grade
                    ? 'bg-neon-amber'
                    : 'bg-white/10 hover:bg-neon-amber/50',
                )}
                style={{ height: `${Math.max(6, (step.value / maxValue) * 100)}%` }}
              >
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-slate-500">
                  {step.grade}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-[10px] leading-relaxed text-slate-600">
            가치·상승폭은 공개 API 에 없는 항목이라 자체 추정 모델을 씁니다. 실제 거래소 시세와 다를 수
            있습니다.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function SquadSummary({ formation }: { formation: Formation }) {
  const assignments = useSquadStore((state) => state.assignments);
  const selectedSlot = useSquadStore((state) => state.selectedSlot);

  const entries: SquadEntry[] = useMemo(
    () =>
      formation.slots
        .map((slot) => {
          const entry = assignments[slot.id];
          if (!entry) return null;
          return {
            slotId: slot.id,
            slotPosition: slot.position,
            card: entry.card,
            grade: entry.grade,
          };
        })
        .filter((e): e is SquadEntry => e !== null),
    [formation, assignments],
  );

  const rating = useMemo(() => rateSquad(entries), [entries]);
  const complete = rating.filled === formation.slots.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="스쿼드 평가"
          description={`${rating.filled} / ${formation.slots.length} 명 배치`}
          action={
            complete ? (
              <Badge tone="lime">완성</Badge>
            ) : (
              <Badge tone="neutral">{formation.slots.length - rating.filled}자리 비어 있음</Badge>
            )
          }
        />

        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          <StatTile
            label="종합 오버롤"
            value={rating.overall || '-'}
            sub={rating.chemistryBonus > 0 ? `팀컬러 +${rating.chemistryBonus}` : '팀컬러 없음'}
            tone={rating.overall >= 90 ? 'good' : 'neutral'}
          />
          <StatTile label="수비" value={rating.lines.defence || '-'} />
          <StatTile label="미드필드" value={rating.lines.midfield || '-'} />
          <StatTile label="공격" value={rating.lines.attack || '-'} />
        </div>

        <div className="grid gap-4 border-t border-white/[0.06] p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">평균 능력치</p>
            <StatBar label="속도" value={rating.averageStats.pace} />
            <StatBar label="슛" value={rating.averageStats.shooting} />
            <StatBar label="패스" value={rating.averageStats.passing} />
            <StatBar label="드리블" value={rating.averageStats.dribbling} />
            <StatBar label="수비" value={rating.averageStats.defending} />
            <StatBar label="피지컬" value={rating.averageStats.physical} />
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
              <Users2 size={11} /> 팀컬러 (자체 근사)
            </p>
            {rating.teamColors.length === 0 ? (
              <p className="text-xs text-slate-500">
                아직 발동한 팀컬러가 없습니다. 같은 클럽·국가·리그 선수를 모아 보세요.
              </p>
            ) : (
              <ul className="space-y-1">
                {rating.teamColors.slice(0, 5).map((color) => (
                  <li
                    key={`${color.kind}-${color.label}`}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate text-slate-300">{color.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="num text-slate-500">{color.count}명</span>
                      <Badge tone={color.level >= 3 ? 'amber' : color.level === 2 ? 'cyan' : 'lime'}>
                        Lv.{color.level}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {rating.hints.length > 0 ? (
              <p className="flex items-start gap-1.5 text-[10px] text-slate-500">
                <Sparkles size={11} className="mt-0.5 shrink-0 text-neon-cyan" />
                <span>
                  {rating.hints
                    .map((hint) => `${hint.label} ${hint.need}명 더`)
                    .join(' · ')}{' '}
                  모으면 팀컬러가 발동합니다.
                </span>
              </p>
            ) : null}

            {rating.misfits.length > 0 ? (
              <p className="flex items-start gap-1.5 text-[10px] text-neon-amber">
                <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                <span>
                  포지션이 맞지 않는 선수: {rating.misfits.map((m) => m.name).join(', ')}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">스쿼드 총 추정 가치</span>
            <span className="num text-lg font-bold text-neon-lime">
              {formatBP(rating.totalValue)} BP
            </span>
          </div>
        </div>
      </Card>

      {selectedSlot && assignments[selectedSlot] ? <EnhancePanel slotId={selectedSlot} /> : null}
    </div>
  );
}
