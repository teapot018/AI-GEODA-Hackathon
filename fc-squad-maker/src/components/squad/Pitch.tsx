'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { PlayerCard } from '@/components/squad/PlayerCard';
import { fitLabel, positionFit } from '@/lib/squad/chemistry';
import type { Formation, FormationSlot } from '@/lib/squad/formations';
import { useSquadStore, type Assignment } from '@/lib/squad/store';
import { cn } from '@/lib/utils/cn';

/** 드래그 전송 포맷: 검색 패널 카드와 피치 슬롯을 구분한다. */
export const DRAG_CARD = 'application/x-fc-card';
export const DRAG_SLOT = 'application/x-fc-slot';

function SlotView({
  slot,
  entry,
  selected,
  onSelect,
  onRemove,
}: {
  slot: FormationSlot;
  entry?: Assignment;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const assign = useSquadStore((state) => state.assign);
  const swap = useSquadStore((state) => state.swap);

  const fit = entry ? positionFit(entry.card, slot.position) : undefined;
  const label = fit !== undefined ? fitLabel(fit) : null;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
    >
      <div
        onDragOver={(event) => {
          if (
            event.dataTransfer.types.includes(DRAG_CARD) ||
            event.dataTransfer.types.includes(DRAG_SLOT)
          ) {
            event.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);

          const slotPayload = event.dataTransfer.getData(DRAG_SLOT);
          if (slotPayload) {
            swap(slotPayload, slot.id);
            return;
          }
          const cardPayload = event.dataTransfer.getData(DRAG_CARD);
          if (cardPayload) {
            try {
              assign(slot.id, JSON.parse(cardPayload));
            } catch {
              /* 잘못된 페이로드는 무시 */
            }
          }
        }}
        className={cn(
          'relative rounded-xl transition-transform',
          dragOver && 'scale-105 ring-2 ring-neon-cyan',
        )}
      >
        {entry ? (
          <div
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_SLOT, slot.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            className="cursor-grab active:cursor-grabbing"
          >
            <PlayerCard
              card={entry.card}
              grade={entry.grade}
              size="sm"
              fit={fit}
              selected={selected}
              onClick={onSelect}
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              aria-label={`${entry.card.name} 제외`}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-white/10 bg-pitch-900 text-slate-400 opacity-0 transition-opacity hover:text-neon-rose group-hover:opacity-100 focus:opacity-100"
            >
              <X size={11} />
            </button>
            {label && label.tone !== 'good' ? (
              <span
                className={cn(
                  'absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1 text-[9px] font-bold',
                  label.tone === 'warn' ? 'bg-neon-amber text-pitch-950' : 'bg-neon-rose text-white',
                )}
              >
                {slot.position} {label.text}
              </span>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              'grid h-[74px] w-[56px] place-items-center rounded-xl border-2 border-dashed transition-colors',
              selected
                ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                : 'border-white/15 bg-white/[0.03] text-slate-500 hover:border-neon-cyan/50 hover:text-neon-cyan',
            )}
          >
            <span className="flex flex-col items-center gap-0.5">
              <Plus size={13} />
              <span className="text-[10px] font-bold">{slot.position}</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

export function Pitch({ formation }: { formation: Formation }) {
  const assignments = useSquadStore((state) => state.assignments);
  const selectedSlot = useSquadStore((state) => state.selectedSlot);
  const selectSlot = useSquadStore((state) => state.selectSlot);
  const remove = useSquadStore((state) => state.remove);

  return (
    <div className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#0d2018] via-[#0a1a14] to-[#081210] pitch-lines sm:aspect-[4/5]">
      {/* 필드 라인 */}
      <div className="pointer-events-none absolute inset-3 rounded-lg border border-white/[0.08]" />
      <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-px bg-white/[0.08]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.08]" />
      <div className="pointer-events-none absolute bottom-3 left-1/2 h-16 w-40 -translate-x-1/2 rounded-t-none border border-b-0 border-white/[0.08]" />
      <div className="pointer-events-none absolute top-3 left-1/2 h-16 w-40 -translate-x-1/2 border border-t-0 border-white/[0.08]" />

      {formation.slots.map((slot) => (
        <SlotView
          key={slot.id}
          slot={slot}
          entry={assignments[slot.id]}
          selected={selectedSlot === slot.id}
          onSelect={() => selectSlot(slot.id)}
          onRemove={() => remove(slot.id)}
        />
      ))}
    </div>
  );
}
