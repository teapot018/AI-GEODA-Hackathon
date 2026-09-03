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

/**
 * 가져온 스쿼드가 **어디까지 사실인지**.
 *
 * 넥슨 `/match-detail` 이 주는 것은 선발 선수 목록과 각자의 포지션
 * 코드다. **포메이션 이름은 주지 않는다.** 우리가 포지션 구성으로
 * 가장 잘 맞는 포메이션을 골라 낸 것이고, 그건 추정이다 — 4-2-3-1 로
 * 세운 스쿼드가 4-2-1-3 으로 읽히는 일이 얼마든지 있다.
 *
 * 그래서 "포메이션 복원" 이라고 부르지 않고, 일치도를 같이 들고 다닌다.
 */
export interface ImportProvenance {
  /** 어느 경기에서 왔는지 (계층 A) */
  matchId: string;
  nickname: string;
  /** 포메이션 추정의 일치도 0~1 (계층 C) */
  formationConfidence: number;
  /** 넥슨이 준 선발 인원 수 — 11명이 아닐 수 있다 */
  starters: number;
  /** 카탈로그에서 못 찾아 배치하지 못한 카드 수 */
  missing: number;
}

interface SquadState {
  formationId: string;
  assignments: Record<string, Assignment>;
  selectedSlot: string | null;
  /** 마지막으로 가져온 스쿼드의 출처. 직접 편집을 시작하면 지운다. */
  imported: ImportProvenance | null;

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
  /** 실제 경기 라인업을 통째로 올린다 (기존 구성은 덮어쓴다) */
  importSquad: (
    formationId: string,
    slots: ImportedSlotInput[],
    provenance: ImportProvenance,
  ) => void;
}

/** /api/manager/squad 가 내려주는 슬롯 배치 */
export interface ImportedSlotInput {
  slotId: string;
  card: PlayerCardData;
  grade: number;
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
      imported: null,

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
            // 사용자가 포메이션을 직접 골랐으면 "이 경기의 스쿼드" 가
            // 아니게 된다. 출처를 남겨 두면 화면이 거짓말을 하게 된다.
            imported: null,
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
          return { assignments: next, selectedSlot: null, imported: null };
        }),

      remove: (slotId) =>
        set((state) => {
          const next = { ...state.assignments };
          delete next[slotId];
          return { assignments: next, selectedSlot: null, imported: null };
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
            imported: null,
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
          return { assignments: next, selectedSlot: null, imported: null };
        }),

      clear: () => set({ assignments: {}, selectedSlot: null, imported: null }),

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
          return { assignments: next, imported: null };
        }),

      importSquad: (formationId, slots, provenance) => {
        const formation = findFormation(formationId);
        const valid = new Set(formation.slots.map((slot) => slot.id));
        const assignments: Record<string, Assignment> = {};

        for (const { slotId, card, grade } of slots) {
          // 서버가 보낸 슬롯 ID 가 이 포메이션에 없으면 조용히 버린다.
          if (!valid.has(slotId)) continue;
          assignments[slotId] = { card, grade: clampGrade(grade) };
        }

        set({
          formationId: formation.id,
          assignments,
          selectedSlot: null,
          imported: {
            ...provenance,
            // 배치까지 마친 뒤의 실제 인원. 서버가 센 값과 다를 수 있어
            // 여기서 다시 센다 — 화면이 "11명 중 9명 배치" 를 적으려면
            // 두 숫자가 같은 시점의 것이어야 한다.
            missing: provenance.starters - Object.keys(assignments).length,
          },
        });
      },
    }),
    {
      name: 'fc-squad-maker:squad',
      storage: createJSONStorage(() => localStorage),
      // 함수는 저장하지 않는다.
      partialize: (state) => ({
        formationId: state.formationId,
        assignments: state.assignments,
        imported: state.imported,
      }),
    },
  ),
);
