'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PlayerCardData, PositionCode } from '@/lib/players/types';
import { clampGrade } from '@/lib/players/value';
import { positionFit } from './chemistry';
import { DEFAULT_FORMATION, findFormation, type Formation } from './formations';

/**
 * 스쿼드 편집 상태.
 *
 * localStorage 에 저장해 새로고침해도 구성이 남게 한다.
 * (서버 저장이 필요해지면 persist 스토리지만 교체하면 된다.)
 */

export interface Assignment {
  card: PlayerCardData;
  grade: number;
}

interface SquadState {
  formationId: string;
  assignments: Record<string, Assignment>;
  selectedSlot: string | null;

  formation: () => Formation;
  setFormation: (id: string) => void;
  selectSlot: (slotId: string | null) => void;
  assign: (slotId: string, card: PlayerCardData) => void;
  remove: (slotId: string) => void;
  setGrade: (slotId: string, grade: number) => void;
  swap: (a: string, b: string) => void;
  clear: () => void;
  /** 검색 결과에서 오버롤 순으로 빈 자리를 자동으로 채운다 */
  autoFill: (candidates: PlayerCardData[]) => void;
}

/** 포메이션을 바꿀 때 기존 선수를 가장 잘 맞는 새 슬롯으로 옮긴다. */
function remap(
  previous: Formation,
  next: Formation,
  assignments: Record<string, Assignment>,
): Record<string, Assignment> {
  const placed: Record<string, Assignment> = {};
  const pool = previous.slots
    .map((slot) => assignments[slot.id])
    .filter((entry): entry is Assignment => Boolean(entry));

  const remaining = [...pool];
  for (const slot of next.slots) {
    if (remaining.length === 0) break;
    let bestIndex = 0;
    let bestFit = -1;
    remaining.forEach((entry, index) => {
      const fit = positionFit(entry.card, slot.position);
      if (fit > bestFit) {
        bestFit = fit;
        bestIndex = index;
      }
    });
    placed[slot.id] = remaining[bestIndex];
    remaining.splice(bestIndex, 1);
  }
  return placed;
}

export const useSquadStore = create<SquadState>()(
  persist(
    (set, get) => ({
      formationId: DEFAULT_FORMATION.id,
      assignments: {},
      selectedSlot: null,

      formation: () => findFormation(get().formationId),

      setFormation: (id) =>
        set((state) => {
          const previous = findFormation(state.formationId);
          const next = findFormation(id);
          if (previous.id === next.id) return state;
          return {
            formationId: next.id,
            assignments: remap(previous, next, state.assignments),
            selectedSlot: null,
          };
        }),

      selectSlot: (slotId) =>
        set((state) => ({ selectedSlot: state.selectedSlot === slotId ? null : slotId })),

      assign: (slotId, card) =>
        set((state) => {
          // 같은 카드가 다른 자리에 이미 있으면 그 자리를 비운다 (중복 배치 방지)
          const next = { ...state.assignments };
          for (const [id, entry] of Object.entries(next)) {
            if (entry.card.spid === card.spid && id !== slotId) delete next[id];
          }
          next[slotId] = { card, grade: next[slotId]?.grade ?? 1 };
          return { assignments: next, selectedSlot: null };
        }),

      remove: (slotId) =>
        set((state) => {
          const next = { ...state.assignments };
          delete next[slotId];
          return { assignments: next, selectedSlot: null };
        }),

      setGrade: (slotId, grade) =>
        set((state) => {
          const entry = state.assignments[slotId];
          if (!entry) return state;
          return {
            assignments: {
              ...state.assignments,
              [slotId]: { ...entry, grade: clampGrade(grade) },
            },
          };
        }),

      swap: (a, b) =>
        set((state) => {
          if (a === b) return state;
          const next = { ...state.assignments };
          const entryA = next[a];
          const entryB = next[b];
          if (entryB) next[a] = entryB;
          else delete next[a];
          if (entryA) next[b] = entryA;
          else delete next[b];
          return { assignments: next, selectedSlot: null };
        }),

      clear: () => set({ assignments: {}, selectedSlot: null }),

      autoFill: (candidates) =>
        set((state) => {
          const formation = findFormation(state.formationId);
          const next = { ...state.assignments };
          const used = new Set(Object.values(next).map((entry) => entry.card.spid));

          for (const slot of formation.slots) {
            if (next[slot.id]) continue;
            let best: PlayerCardData | null = null;
            let bestScore = -1;
            for (const card of candidates) {
              if (used.has(card.spid)) continue;
              const score = card.ovr * positionFit(card, slot.position as PositionCode);
              if (score > bestScore) {
                bestScore = score;
                best = card;
              }
            }
            if (best) {
              next[slot.id] = { card: best, grade: 1 };
              used.add(best.spid);
            }
          }
          return { assignments: next };
        }),
    }),
    {
      name: 'fc-squad-maker:squad',
      storage: createJSONStorage(() => localStorage),
      // 함수는 저장하지 않는다.
      partialize: (state) => ({
        formationId: state.formationId,
        assignments: state.assignments,
      }),
    },
  ),
);
