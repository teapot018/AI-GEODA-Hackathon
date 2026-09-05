'use client';

import { useMemo } from 'react';
import { Sparkles, TrendingUp, TriangleAlert, Users2, Waves } from 'lucide-react';

import { Badge, Card, CardHeader, DataLayerTag, StatBar, StatTile } from '@/components/ui';
import {
  ENHANCE_TEAMCOLOR_COUNTS,
  ENHANCE_TEAMCOLOR_TIERS,
} from '@/lib/fconline/rules';
import {
  ENHANCED_CARD_LAYERS,
  enhanceCard,
  enhanceCurve,
  upgradeOdds,
} from '@/lib/players/enhance';
import { MAX_GRADE } from '@/lib/players/value';
import type { Formation } from '@/lib/squad/formations';
import { rateSquad, type SquadEntry, type SquadRating } from '@/lib/squad/rating';
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
  const maxValue = curve[curve.length - 1]?.estimatedValue ?? 1;

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
          {/*
            같은 줄에 성격이 다른 세 숫자가 뜬다.
             - 오버롤: 기본값은 우리 추정(카탈로그), 상승분은 공식 표.
             - 가치: 전부 우리 모델. 게임에 이런 숫자는 없다.
             - 성공률: 넥슨이 공개한 강화 확률.

            계층은 여기서 고르지 않는다. 예전에는 세 칸에 각각 문자열을
            적어 두고 옆에 "섞였으니 약한 쪽으로" 라는 주석을 달았는데,
            그러면 규칙이 화면마다 다시 지켜져야 한다. 지금은 값을 만든
            쪽(players/enhance.ts)이 mixLayers 로 접어 둔 것을 읽는다.
          */}
          <StatTile
            label="추정 오버롤"
            value={current.ovr}
            sub={`추정 기본 ${entry.card.ovr} + 공식 강화 ${current.ovr - entry.card.ovr}`}
            layer={ENHANCED_CARD_LAYERS.ovr}
          />
          <StatTile
            label="추정 가치"
            value={`${formatBP(current.estimatedValue)}`}
            sub="BP"
            tone="good"
            layer={ENHANCED_CARD_LAYERS.estimatedValue}
          />
          <StatTile
            label="+1→현재 성공률"
            value={formatPercent(odds.straightRate, 1)}
            sub={`기대 시도 ${odds.expectedAttempts.toFixed(1)}회`}
            tone={odds.straightRate < 0.05 ? 'bad' : 'neutral'}
            layer={ENHANCED_CARD_LAYERS.odds}
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
                title={`+${step.grade} · 추정 OVR ${step.ovr} · 추정 ${formatBP(step.estimatedValue)} BP`}
                className={cn(
                  'group relative flex-1 rounded-t transition-colors',
                  step.grade === entry.grade
                    ? 'bg-neon-amber'
                    : 'bg-white/10 hover:bg-neon-amber/50',
                )}
                style={{ height: `${Math.max(6, (step.estimatedValue / maxValue) * 100)}%` }}
              >
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-slate-500">
                  {step.grade}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] leading-relaxed text-slate-600">
            <DataLayerTag layer={ENHANCED_CARD_LAYERS.estimatedValue} />
            가치와 기본 오버롤은 공개 API 에 없는 항목이라 자체 추정 모델을 씁니다 — 게임에 뜨는 값이
            아니고, 실제 거래 가격과도 다릅니다.
            <DataLayerTag layer={ENHANCED_CARD_LAYERS.odds} />
            강화 단계별 오버롤 상승과 성공 확률은 넥슨이 공개한 값입니다.
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

          {/*
            강화 팀컬러(물결). 클럽/국가/리그 팀컬러와 축이 다르다 —
            실제 게임에서 "은카", "8금" 이라고 부르는 그것이고, 이 화면에는
            그 축이 통째로 없었다. 규칙표를 넥슨 공지로 대조하지 못해
            종합 점수에는 넣지 않고, 조건을 만족했다는 사실만 알린다.
          */}
          <EnhanceWaveNote wave={rating.enhanceTeamColor} entries={entries} />

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
              <Users2 size={11} /> 클럽·국가·리그 팀컬러 (자체 근사)
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

/**
 * 강화 팀컬러(물결) 안내.
 *
 * 실제 FC 온라인에서 스쿼드를 말할 때 먼저 나오는 것이 "은카", "8금" 인데,
 * 이 화면에는 그 축이 없었다. 같은 카드 11장이라도 5강이냐 8강이냐에 따라
 * 전 선수 능력치가 달라지는데 우리는 0으로 봤다.
 *
 * 다만 규칙표를 넥슨 공지 원문으로 대조하지 못했다. 그래서 종합 점수에는
 * 넣지 않고, 조건 충족 여부만 미검증 표시와 함께 알린다 — 미검증 보너스를
 * 점수에 섞으면 그 점수가 어디서 왔는지 아무도 못 가른다.
 */
function EnhanceWaveNote({
  wave,
  entries,
}: {
  wave: SquadRating['enhanceTeamColor'];
  entries: SquadEntry[];
}) {
  if (entries.length === 0) return null;

  // 다음 단계까지 몇 명이 모자란지 — 없을 때도 방향은 알려 준다.
  const next = ENHANCE_TEAMCOLOR_TIERS.find((tier) => {
    const count = entries.filter((e) => e.grade >= tier.minGrade).length;
    return count < ENHANCE_TEAMCOLOR_COUNTS.tier1;
  });

  return (
    <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <Waves size={11} /> 강화 팀컬러
        <DataLayerTag layer="unverified">규칙 미검증</DataLayerTag>
      </p>

      {wave ? (
        <p className="text-xs text-slate-300">
          <b className="text-neon-cyan">{wave.name}</b>{' '}
          <span className="text-slate-500">
            (+{wave.minGrade} 이상 {wave.count}명 · {wave.requirement}명 조건)
          </span>
          <br />
          <span className="text-[10px] text-slate-500">
            전 능력치 +{wave.bonus} 로 알려져 있습니다.
          </span>
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          아직 발동한 물결이 없습니다.
          {next ? (
            <>
              {' '}
              <b className="text-slate-400">+{next.minGrade} 이상</b> 선수를{' '}
              {ENHANCE_TEAMCOLOR_COUNTS.tier1}명 모으면 {next.name}이 발동합니다.
            </>
          ) : null}
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-slate-600">
        이 단계표는 커뮤니티 정리에서 가져왔고 넥슨 공지 원문으로 대조하지 못했습니다. 그래서 위
        <b className="text-slate-500"> 종합 오버롤에는 더하지 않았습니다</b>.
      </p>
    </div>
  );
}
