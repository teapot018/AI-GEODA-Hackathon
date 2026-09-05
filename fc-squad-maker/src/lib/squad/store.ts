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

/* ── 저장된 상태 되살리기 ──────────────────────────────────
 *
 * localStorage 에 있는 값은 **이 코드가 쓴 것이라는 보장이 없다.** 몇 달
 * 전 버전이 쓴 것일 수도, 사람이 콘솔에서 고친 것일 수도 있다. 그대로
 * 스토어에 부으면 화면은 그 값을 오늘 계산한 값처럼 보여 준다.
 *
 * ── 왜 옛 스쿼드를 버리는가 ──
 * 이 프로젝트는 카드 오버롤 표기를 두 자리(92)에서 FC 온라인 범위(121)로
 * 옮긴 적이 있다. 그런데 저장되는 것은 spid 가 아니라 **카드 객체 통째**라,
 * 그 전에 저장된 스쿼드에는 두 자리 오버롤 카드가 그대로 남아 있다.
 * 거기에 새로 검색한 카드를 한 명 넣으면, 한 스쿼드 안에서 92 와 121 이
 * 같은 평균에 들어간다 — 스쿼드 평점이 조용히 틀린다.
 *
 * 저장된 값만 보고 어느 쪽 눈금인지 가려낼 방법은 없다. 92 도 121 도
 * MIN_ESTIMATED_OVR~MAX_ESTIMATED_OVR 안에 들어가기 때문이다. 그래서
 * 추측해서 고치지 않고, **버전이 다르면 배치를 버린다.** 사용자는 스쿼드를
 * 다시 짜야 하지만, 그건 틀린 평점을 믿는 것보다 낫다.
 *
 * 버전이 같아도 검증은 한다. 형식이 깨진 항목 하나가 화면 전체를
 * 무너뜨리게 두지 않는다.
 */

/** 저장 스키마 버전. 저장되는 값의 **의미**가 바뀌면 올린다. */
export const SQUAD_STORE_VERSION = 1;

export interface PersistedSquad {
  formationId: string;
  assignments: Record<string, Assignment>;
  imported: ImportProvenance | null;
}

const EMPTY: PersistedSquad = {
  formationId: DEFAULT_FORMATION.id,
  assignments: {},
  imported: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 카드로 쓸 수 있을 만큼 모양이 갖춰졌는가. 없는 필드는 지어내지 않는다. */
function looksLikeCard(value: unknown): value is PlayerCardData {
  if (!isRecord(value)) return false;
  return (
    typeof value.spid === 'number' &&
    Number.isFinite(value.spid) &&
    value.spid > 0 &&
    typeof value.name === 'string' &&
    Array.isArray(value.positions) &&
    value.positions.length > 0 &&
    typeof value.ovr === 'number' &&
    Number.isFinite(value.ovr) &&
    isRecord(value.stats)
  );
}

function readImported(value: unknown): ImportProvenance | null {
  if (!isRecord(value)) return null;
  if (typeof value.matchId !== 'string' || typeof value.nickname !== 'string') return null;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    matchId: value.matchId,
    nickname: value.nickname,
    formationConfidence: num(value.formationConfidence, 0),
    starters: num(value.starters, 0),
    missing: num(value.missing, 0),
  };
}

/**
 * 저장된 값을 오늘의 스키마로 되살린다. 살릴 수 없는 항목은 버린다.
 *
 * `dropAssignments` 는 버전이 다를 때 쓴다 — 형식은 멀쩡해도 숫자의
 * 의미가 달라졌을 수 있어서, 형식 검사로는 걸러지지 않는다.
 */
export function sanitizePersistedSquad(
  raw: unknown,
  { dropAssignments = false }: { dropAssignments?: boolean } = {},
): PersistedSquad {
  if (!isRecord(raw)) return EMPTY;

  const formation =
    typeof raw.formationId === 'string' ? findFormation(raw.formationId) : DEFAULT_FORMATION;

  if (dropAssignments) {
    // 포메이션 선택은 눈금이 바뀌어도 뜻이 같아서 남긴다.
    return { formationId: formation.id, assignments: {}, imported: null };
  }

  const valid = new Set(formation.slots.map((slot) => slot.id));
  const assignments: Record<string, Assignment> = {};
  let dropped = 0;

  const source = isRecord(raw.assignments) ? raw.assignments : {};
  for (const [slotId, entry] of Object.entries(source)) {
    // 이 포메이션에 없는 자리에 붙은 카드는 화면에 그릴 곳이 없다.
    if (!valid.has(slotId) || !isRecord(entry) || !looksLikeCard(entry.card)) {
      dropped += 1;
      continue;
    }
    // 강화 단계는 저장 당시의 상한이 지금과 다를 수 있다. 오늘 규칙으로 자른다.
    const grade = typeof entry.grade === 'number' ? entry.grade : 1;
    assignments[slotId] = { card: entry.card, grade: clampGrade(grade) };
  }

  /*
   * 한 명이라도 버렸다면 "이 경기에서 가져온 스쿼드" 라는 표시는 더 이상
   * 사실이 아니다. 출처만 남겨 두면 화면이 없는 근거를 대게 된다.
   */
  const imported = dropped > 0 ? null : readImported(raw.imported);

  return { formationId: formation.id, assignments, imported };
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
      version: SQUAD_STORE_VERSION,
      // 함수는 저장하지 않는다.
      partialize: (state) => ({
        formationId: state.formationId,
        assignments: state.assignments,
        imported: state.imported,
      }),
      /*
       * 버전이 다른 값. 형식은 멀쩡할 수 있지만 숫자의 뜻이 달라졌을 수
       * 있어(오버롤 눈금 변경) 배치는 버린다. 추측해서 변환하지 않는다.
       */
      migrate: (persisted, from) =>
        sanitizePersistedSquad(persisted, { dropAssignments: from < SQUAD_STORE_VERSION }),
      /*
       * 버전이 같은 값도 그대로 믿지 않는다. 저장소는 누구나 고칠 수 있고,
       * 깨진 항목 하나가 화면 전체를 무너뜨리게 둘 이유가 없다.
       */
      merge: (persisted, current) => ({ ...current, ...sanitizePersistedSquad(persisted) }),
    },
  ),
);
