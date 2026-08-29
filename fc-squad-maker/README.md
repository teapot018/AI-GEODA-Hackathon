# FC 스쿼드 메이커

넥슨 **FC 온라인 Open API** 기반의 구단주 조회 · 선수 검색 · 스쿼드 빌더 · 모의 상자 개봉 시뮬레이터.
Next.js 15 (App Router) + TypeScript + Tailwind CSS.

> 설치 없이 화면만 먼저 보고 싶다면 저장소 루트의 [`demo/index.html`](../demo) 을 브라우저로 열면 됩니다.
> 같은 로직을 서버 없이 도는 한 페이지로 옮긴 판입니다 (넥슨 API 는 호출하지 않고 샘플 데이터를 씁니다).

```
구단주 조회        닉네임 → OUID → 레벨/최고등급/매치기록/거래내역
스쿼드 메이커      초성 검색 → 드래그 배치 → 팀컬러·강화 시뮬레이션
모의 상자 개봉     확률 테이블 → 서버 가중 추첨 → 연출 + 회수율 집계
```

---

## 1. 빠른 시작

```bash
npm install
cp .env.example .env.local     # NX_API_KEY 입력 (없어도 데모 모드로 실행됨)
npm run dev                    # http://localhost:3000
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm start` | 빌드 결과 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint |

### API 키 발급

1. <https://openapi.nexon.com> 접속 → 넥슨 계정 로그인
2. 상단 **[APPLICATION]** → **애플리케이션 등록**
3. 게임에서 **FC ONLINE** 선택, 서비스 정보 입력 후 등록
4. 발급된 **api key** 를 `.env.local` 의 `NX_API_KEY` 에 붙여넣기

```env
NX_API_KEY=live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **`NEXT_PUBLIC_NX_API_KEY` 는 쓰지 마세요.**
> `NEXT_PUBLIC_` 접두사가 붙은 값은 클라이언트 번들에 **문자열 그대로 인라인**되어
> 배포 즉시 누구나 devtools 에서 꺼내 쓸 수 있습니다. 이 프로젝트는 접두사 없는
> 서버 전용 변수만 사용하고, 브라우저는 항상 자체 `/api/*` 프록시를 거칩니다.
> `src/lib/env.ts` 는 `server-only` 를 import 하므로, 클라이언트 컴포넌트에서
> 실수로 키에 접근하면 **빌드 타임에 에러**가 납니다.

### 데모 모드

키가 없거나 (`FC_ALLOW_MOCK=true`, 기본값) 넥슨 API 호출이 실패하면
닉네임에서 시드를 뽑아 **결정적으로 생성된 목업 데이터**로 화면을 채웁니다.
모든 응답에 `source: "mock"` 이 실리고 UI 에 `데모 데이터` 배지가 뜨므로,
실데이터와 절대 혼동되지 않습니다. 운영에서는 `FC_ALLOW_MOCK=false` 로 두어
실패를 숨기지 않는 편을 권장합니다.

---

## 2. 프로젝트 구조

```
src/
├── app/
│   ├── page.tsx                    랜딩 (기능 소개 + 설정 상태)
│   ├── manager/page.tsx            구단주 조회
│   ├── squad/page.tsx              스쿼드 메이커
│   ├── pack/page.tsx               모의 상자 개봉
│   └── api/                        ── 프록시 레이어 (CORS·키 노출 차단) ──
│       ├── health/                 설정 상태 점검
│       ├── manager/                ?nickname= → OUID + 기본정보 + 최고등급
│       │   ├── matches/            ?ouid= → 최근 매치 요약
│       │   └── trades/             ?ouid= → 거래 내역 + 자금 흐름
│       ├── match/[matchId]/        매치 상세 + 출전 명단(카드 정보 병합)
│       ├── players/                ?q= 초성 검색 · ?season= · ?position=
│       │   └── [spid]/             카드 상세 + 강화 +1~+10 곡선
│       └── pack/                   상자 목록 / ?box= 확률·기대값
│           └── open/               POST 서버 추첨
│
├── components/
│   ├── layout/SiteHeader.tsx
│   ├── ui/index.tsx                Button·Card·Badge·StatBar·StatTile …
│   ├── manager/                    UserSearch · ManagerProfile · MatchHistory · AssetPanel
│   ├── squad/                      SquadBuilder · Pitch · PlayerSearchPanel · PlayerCard · SquadSummary
│   └── pack/                       BoxSimulator · OddsTable · PackResultGrid
│
└── lib/
    ├── env.ts                      서버 전용 환경변수 (server-only)
    ├── api/respond.ts              라우트 공통 응답 규격 + 에러 변환
    ├── client/api.ts               브라우저 → /api/* fetch 헬퍼
    ├── nexon/
    │   ├── client.ts               타임아웃·재시도·에러코드 매핑 fetch
    │   ├── endpoints.ts            경로 상수 · 이미지 URL · spid 파싱
    │   ├── meta.ts                 정적 메타 로더 (2중 캐시 + 데모 폴백)
    │   ├── service.ts              화면용 가공 레이어
    │   ├── mock.ts                 결정적 목업 생성기
    │   └── types.ts                Open API 응답 타입
    ├── players/                    dataset · catalog · estimate · enhance · value · seasons
    ├── squad/                      formations · chemistry · rating · store(zustand)
    ├── pack/                       boxes(확률표) · simulator(추첨 엔진)
    └── utils/                      hangul(초성) · rng(시드 난수) · format · cn
```

### 호출 흐름

```
브라우저                  Next.js 서버                     넥슨
─────────                ─────────────                   ──────
PlayerSearchPanel
   │ fetch('/api/players?q=ㅅㅎㅁ')
   └───────────────────▶ route.ts
                          └▶ catalog.searchPlayers()
                               ├▶ meta.loadMeta() ─────▶ static/…/spid.json
                               │                        (24h 캐시, 인증 불필요)
                               └▶ PLAYER_SEED 조인 (능력치)
   ◀────────────────────  { ok, data, source }

UserSearch
   │ fetch('/api/manager?nickname=…')
   └───────────────────▶ route.ts
                          └▶ service.getManagerOverview()
                               ├▶ /fconline/v1/id       ─┐
                               ├▶ /fconline/v1/user/basic│ x-nxopen-api-key
                               └▶ …/user/maxdivision    ─┘ (서버에서만)
```

API 키는 서버 프로세스 밖으로 나가지 않고, 브라우저는 넥슨 도메인을 직접 호출하지
않으므로 CORS 문제도 발생하지 않습니다.

---

## 3. 사용하는 넥슨 Open API

| 엔드포인트 | 용도 |
| --- | --- |
| `GET /fconline/v1/id` | 닉네임 → OUID |
| `GET /fconline/v1/user/basic` | 닉네임 · 레벨 |
| `GET /fconline/v1/user/maxdivision` | 매치 종류별 역대 최고 등급 |
| `GET /fconline/v1/user/match` | 매치 ID 목록 |
| `GET /fconline/v1/match-detail` | 매치 상세 (스탯 + 출전 선수 11인) |
| `GET /fconline/v1/user/trade` | 이적시장 구매/판매 내역 |
| `GET /static/fconline/meta/spid.json` | 전체 선수 카드 목록 (id, name) |
| `GET /static/fconline/meta/seasonid.json` | 시즌 클래스명 · 아이콘 |
| `GET /static/fconline/meta/spposition.json` | 포지션 코드 |
| `GET /static/fconline/meta/matchtype.json` | 매치 종류 코드 |
| `GET /static/fconline/meta/division.json` | 등급 코드 |

`client.ts` 는 문서화된 오류 코드(`OPENAPI00001`~`OPENAPI00011`)를 한국어 메시지로
변환하고, 429/5xx 에 대해서만 지수 백오프로 재시도합니다.

---

## 4. 데이터 출처 — 무엇이 실데이터이고 무엇이 추정인가

이 부분을 흐리면 서비스 신뢰가 무너지므로, 코드와 UI 양쪽에서 항상 구분합니다.

### ✅ 넥슨 공식 API (실데이터)

OUID · 닉네임 · 레벨 · 역대 최고 등급 · 매치 기록 · 매치 상세 스탯 · 출전 선수 spid ·
거래 내역 · **선수 카드 목록과 시즌 메타**.

### ⚠️ 자체 추정 모델 (공개 API 에 없음)

| 항목 | 어디서 오나 | 파일 |
| --- | --- | --- |
| 능력치 · 오버롤 | 로컬 시드 64명, 없으면 포지션 기반 추정 | `players/dataset.ts`, `players/estimate.ts` |
| 시즌 티어 보정 | className 키워드 매칭 (ICON/TC/UP …) | `players/seasons.ts` |
| BP 가치 | 오버롤 지수곡선 × 시즌 배수 × 강화 배수 | `players/value.ts` |
| 강화 상승폭 · 성공률 | 근사 테이블 | `players/enhance.ts` |
| 팀컬러 | 같은 클럽/국가/리그 인원수 임계치 | `squad/chemistry.ts` |
| 상자 확률 · 가격 | **샘플 값** | `pack/boxes.ts` |

추정 능력치가 쓰인 카드에는 `추정` 배지가 붙습니다.

**보유 자산(BP/캐시 잔액)은 Open API 가 제공하지 않습니다.** 그래서 자산 패널은
잔액 대신 최근 거래 내역으로 계산한 **자금 흐름**(매입/매도/순손익)을 보여주고,
헤더에 `잔액 아님` 을 명시합니다.

### 실데이터로 교체하기

설계상 갈아끼우는 지점이 파일 하나씩으로 고정되어 있습니다.

- **능력치 DB** → `players/dataset.ts` 를 자체 DB/크롤러 결과로 교체.
  조인 키는 **선수 이름**(`spid.json` 의 한글 표기)이라 나머지 코드는 그대로입니다.
- **실제 시세** → `players/value.ts` 의 `estimateValue()` 만 교체.
- **공시 확률** → `pack/boxes.ts` 의 `tiers[].probability` 를 게임 내
  &lsquo;확률 공개&rsquo; 표 값으로 교체. `validateBox()` 가 합계 100% 를 검증합니다.

### 알려진 한계

- 데모 모드의 카드 풀은 시드 64명 × 8시즌 = 512장뿐이라 등급 분포가 상위에 쏠립니다
  (`레전드` 풀이 `에픽` 풀보다 큰 역전이 보일 수 있음). 실제 `spid.json` 을 받아오면
  2만 장 이상으로 정상화됩니다. 풀 크기는 확률표에 그대로 노출됩니다.
- 팀컬러는 넥슨이 정의한 고정 조합 목록이 아니라 인원수 기반 근사입니다.
- 매치 상세는 건당 1콜이라, 목록에서 펼칠 때만 호출합니다(호출량 절약).

---

## 5. 주요 구현 노트

### 초성 검색

완성형 한글의 유니코드 배열(`0xAC00 + (초성×21 + 중성)×28 + 종성`)을 역산해
초성 키를 만들어 둡니다. 질의가 자음으로만 이루어지면 초성 키에, 아니면 이름에
매칭하고 점수(완전일치 100 / 접두 85 / 포함 60)로 정렬합니다.

```
"ㅅㅎㅁ" → 손흥민     "ㄱㅁㅈ" → 김민재     "음바페" → 음바페
```

쌍자음은 단자음으로 접어(`ㄲ→ㄱ`) 오타에도 걸립니다. → `utils/hangul.ts`

### 스쿼드 배치

- **드래그**: 검색 카드 → 피치 슬롯 (`application/x-fc-card`),
  슬롯 → 슬롯 스왑 (`application/x-fc-slot`)
- **클릭**: 빈 슬롯 선택 후 검색 결과 클릭
- **자동 배치**: 현재 검색 결과에서 `오버롤 × 포지션 적합도` 최대인 선수로 빈 자리 채움
- 포메이션을 바꾸면 기존 선수를 적합도 기준으로 새 슬롯에 재배치
- 상태는 zustand + localStorage 에 저장 → `squad/store.ts`

### 상자 추첨

추첨은 **서버에서만** 합니다. 클라이언트에서 뽑으면 확률표가 번들에 노출되고
결과 조작이 가능해 시뮬레이터로서의 신뢰가 떨어지기 때문입니다.

- 가중 추첨은 누적합 + 이진 탐색 `O(log n)` → `utils/rng.ts`
- `mulberry32` 시드 PRNG — 같은 시드는 같은 결과 (결과 공유·확률 검증에 사용)
- 천장(pity): 클라이언트가 카운터를 누적해 보내면 서버가 확정 등급으로 전환
- 등급 풀이 비면 확률이 재분배되므로 `console.warn` 으로 경고

검증 결과 (3,600장 표본, `premium-bp`):

| 등급 | 공시 | 실측 |
| --- | --- | --- |
| common | 62.000% | 62.806% |
| rare | 27.000% | 26.333% |
| epic | 9.300% | 8.944% |
| legend | 1.600% | 1.861% |
| icon | 0.100% | 0.056% |

---

## 6. 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `NX_API_KEY` | (없음) | 넥슨 Open API 키. **서버 전용** |
| `NX_API_BASE` | `https://open.api.nexon.com` | API 베이스 URL |
| `FC_ALLOW_MOCK` | `true` | 실패 시 목업 대체 여부 |
| `FC_PACK_SEED` | (없음) | 상자 추첨 고정 시드 (재현용) |

---

## 7. 고지

넥슨 FC 온라인 Open API 를 이용한 **비공식 팬 프로젝트**입니다.
상자 개봉은 실제 결제·아이템 획득과 무관한 **시뮬레이션**이며, 표시되는 확률은
이 프로젝트가 정의한 샘플 값입니다. 실제 확률은 게임 내 &lsquo;확률 공개&rsquo;
페이지의 공시를 확인하세요.
