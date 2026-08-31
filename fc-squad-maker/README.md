# FC 스쿼드 메이커

넥슨 **FC 온라인 Open API** 기반의 구단주 조회 · 선수 검색 · 스쿼드 빌더 · 모의 상자 개봉 시뮬레이터.
Next.js 15 (App Router) + TypeScript + Tailwind CSS.

> 설치 없이 화면만 먼저 보고 싶다면 저장소 루트의 [`demo/index.html`](../demo) 을 브라우저로 열면 됩니다.
> 같은 로직을 서버 없이 도는 한 페이지로 옮긴 판입니다 (넥슨 API 는 호출하지 않고 샘플 데이터를 씁니다).

```
구단주 조회        닉네임 → OUID → 레벨/최고등급/매치기록/거래내역
                   + 최근 20경기 집계 → 승률·득실·선수별 실전 성능
스쿼드 메이커      초성 검색 → 드래그 배치 → 팀컬러·강화 시뮬레이션
                   + 실제 경기 라인업 그대로 가져오기
시세 관측소        거래 내역의 실체결가 수집 → 카드별 가격대·변동폭·추세
모의 상자 개봉     확률 테이블 → 서버 가중 추첨 → 연출 + 회수율 집계
트레이드 계산기    매입/매도 + 5% 수수료 → 실현 손익·손익분기가
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
| `npm run check:api` | **넥슨 API 점검** — 키가 통하는지, 최신 시즌이 잡히는지 |

### 키를 넣기 전에: `npm run check:api`

키가 실제로 동작하는지, 그리고 **최신 시즌까지 검색되는지**를 앱을 띄우기 전에
확인하는 스크립트입니다. 의존성 없이 Node 만으로 돕니다.

```bash
npm run check:api                                  # .env.local 의 NX_API_KEY 사용
node scripts/check-api.mjs --nickname 내구단주명      # 매치 상세까지 끝까지 조회
node scripts/check-api.mjs --key test_xxx          # 키를 직접 넘겨 확인
node scripts/check-api.mjs --json                  # 결과를 JSON 으로 (CI 용)
```

확인하는 것:

1. **정적 메타** 5종이 열리는가 (인증 불필요)
2. **최신 시즌이 메타에 들어와 있는가** — seasonId 내림차순 상위 8개 시즌과 시즌별 카드 수를 찍어 줍니다.
   여기에 최신 시즌이 보이면 이 앱은 코드 수정 없이 그 시즌까지 검색합니다.
3. **키가 실제로 통하는가** — 넥슨이 돌려준 `OPENAPI000xx` 코드로만 판정합니다.
   프록시가 가로챈 403 처럼 넥슨에 닿지도 못한 응답은 "판정 보류"로 두고 키가 유효하다고 말하지 않습니다.
4. `--nickname` 을 주면 **ouid → 계정정보 → 매치 목록 → 매치 상세 → 출전 선수와 메타 조인**까지 실제로 흘려 봅니다.

종료 코드는 정상 0, 키 불가·메타 접근 실패 1 이라 CI 에 그대로 걸 수 있습니다.

> **테스트 키(`test_`)와 배포 키(`live_`)** — 테스트 키는 유효기간과 호출 한도가 짧습니다.
> 스크립트가 접두사를 보고 경고해 주며, 상시 운영에는 `live_` 키를 발급해 쓰세요.

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
├── scripts/
│   └── check-api.mjs               넥슨 API 점검 (npm run check:api)
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

tests/                              Vitest 스위트 (§6)
├── setup.ts                        네트워크 차단 + 데모 모드 강제
├── helpers.ts                      테스트용 카드 공장
└── stubs/server-only.ts            server-only 패키지 대체품

scripts/check-api.mjs               넥슨 API 키·연결 점검 (npm run check:api)
vitest.config.mts                   경로 별칭 · 테스트 환경
../.github/workflows/ci.yml         타입체크 → 린트 → 테스트 → 빌드
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

### 엔드포인트 하나에서 얼마나 뽑아내는가

같은 6개 엔드포인트에서 화면을 몇 개나 만들 수 있는지가 이 프로젝트의 관심사입니다.
**크롤링은 하지 않습니다** — 아래는 전부 공식 API 응답만으로 계산합니다.

| 엔드포인트 | 원래 쓰던 것 | 추가로 뽑아낸 것 |
| --- | --- | --- |
| `/user/trade` | 매입·매도 총액 | `value` 는 **실제 체결가**다. `offset` 을 밀어 과거까지 모으면 카드별 최저/중앙/최고가, 사분위 흥정 범위, 강화 등급별 시세, 상승·하락 추세가 나온다 → **시세 관측소** |
| `/match-detail` | 골·도움·평점 | 응답에는 22명 전원의 슛·패스·드리블·태클·공중볼·카드 스탯이 다 들어 있다. N경기를 겹치면 승률·득실·점유율·슛정확도·결정력과 **선수별 실전 성능 리포트**가 나온다 |
| `/match-detail` | 출전 명단 표시 | `spPosition` 코드로 **포메이션을 역추론**해 실제 스쿼드를 빌더에 그대로 올린다. 상대 쪽 스쿼드도 된다 |

시세 관측소의 한계는 화면에도 그대로 적어 둡니다: **현재 호가가 아니라 과거
체결가**이고, 조회한 구단주가 실제로 사고판 카드만 나옵니다. Open API 는 현재
이적시장 매물을 제공하지 않으므로, 실시간 호가를 보려면 별도의 수집 인프라와
넥슨 이용약관 검토가 필요합니다.

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

### 데이터가 언제 것인가 (갱신 주기)

이 앱이 보여 주는 값은 대부분 &lsquo;지금&rsquo;이 아닙니다. 시세는 과거 체결가고,
전적은 이미 끝난 경기입니다. 그래서 숫자 옆에 **언제 것인지**를 항상 같이 띄웁니다
(`components/ui/FreshnessNote.tsx`).

| 항목 | 주기·지연 |
| --- | --- |
| 넥슨 데이터센터 **기준가** 집계 | **2시간** 주기. 집계 후 홈페이지 반영까지 추가 지연이 있고, 선수마다 갱신 시점이 달라 게임 내 기준가와 완전히 일치하지는 않습니다 |
| `/user/trade` **체결 기록** | 집계값이 아니라 거래 원본이라 고정 주기가 없습니다. 신선도는 표본의 최신 체결 시각으로 잽니다 |
| `/match-detail` **경기 기록** | 실시간이 아닙니다. 직전 경기는 아직 안 보일 수 있습니다 |
| Open API 데이터 **재사용** | 약관상 크롤링한 데이터는 **30일 이내** 갱신 의무가 있습니다 |

신선도 눈금은 기준가 주기(2시간)에 맞췄습니다 — 최신 체결이 2시간 안쪽이면
게임 내 기준가와 대체로 같은 시대를 보고 있는 셈이고, 하루가 넘어가면 다른
이야기이기 때문입니다.

| 배지 | 조건 |
| --- | --- |
| 최신 | 2시간 이내 |
| 양호 | 12시간 이내 |
| 조금 지남 | 24시간 이내 |
| 오래됨 | 그 이상 |

> **시각은 UTC 로 옵니다.** Open API 는 `2024-06-01T12:34:56` 처럼 타임존이 없는
> 문자열을 주는데 이 값은 UTC 기준입니다. 그냥 `new Date()` 에 넣으면 실행 환경의
> 로컬 시간으로 해석돼 한국에서 9시간이 어긋납니다. `parseApiDate()` 가 `Z` 를
> 붙여 UTC 로 못박고, 표시할 때 `Asia/Seoul` 로 변환합니다.

&lsquo;다음 집계 예상&rsquo;은 2시간 주기를 정각 기준으로 올림한 **어림값**입니다.
넥슨이 정확히 몇 분에 도는지는 공개돼 있지 않아 화면에도 &lsquo;예상&rsquo;이라고 적었습니다.

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

## 6. 테스트와 CI

```bash
npm test          # 전체 테스트 1회 실행
npm run test:watch  # 파일 저장할 때마다 다시 실행
npm run typecheck   # 타입만 검사
npm run lint        # 린트만 검사
```

**테스트는 넥슨 서버에 나가지 않는다.** `tests/setup.ts` 가 `fetch` 를 막아 두기
때문에, 인터넷이 끊긴 노트북에서도 API 키 없이도 그대로 돌아간다. 이때 코드는
데모 폴백 경로를 타므로, "키가 없어도 앱이 열린다"는 약속까지 함께 검증된다.

| 파일 | 무엇을 지키는가 |
| --- | --- |
| `tests/hangul.test.ts` | 초성 검색. 유니코드 산술, 쌍자음 접기, 검색 순위 |
| `tests/rng.test.ts` | 시드 재현성, 가중치 추첨 분포(20만 회) |
| `tests/pack.test.ts` | 확률표 정합성, **모든 등급에 뽑을 카드가 있는지**, 3만 장 분포, 천장 |
| `tests/value.test.ts` | 가치·강화 곡선의 단조성, 연속 강화 확률 |
| `tests/seasons.test.ts` | 시즌 코드 → 티어 판정 (새 시즌이 와도 오분류되지 않게) |
| `tests/chemistry.test.ts` | 팀컬러 발동 임계치, 포지션 적합도 |
| `tests/rating.test.ts` | 포메이션 정의, 스쿼드 종합 평점 조립 |
| `tests/catalog.test.ts` | 데모 폴백, 이름·초성·시즌·포지션 검색 |
| `tests/endpoints.test.ts` | `spid = seasonId × 1,000,000 + pid` — **최신 시즌 지원의 근거** |
| `tests/optimizer.test.ts` | 예산·포지션·케미 점수, 업그레이드 추천 |
| `tests/trade.test.ts` | 수수료 반영 손익, 손익분기 매도가 |
| `tests/market.test.ts` | 분위수·중앙값 보간, 가격 인덱스 집계, 추세 판정, 가격 판정기 |
| `tests/analytics.test.ts` | 승/무/패 분류, 폼 집계, 선수 성능 누적, **성공률이 100% 를 넘지 않는지** |
| `tests/squadImport.test.ts` | `spposition` 코드표 전수 검증, 포메이션 역추론, 중복 배치 금지 |
| `tests/security.test.ts` | **API 키가 브라우저 번들에 닿지 않는지** |

### 왜 `security.test.ts` 가 있는가

이 프로젝트에서 되돌릴 수 없는 사고는 하나뿐이다 — 넥슨 API 키가 클라이언트
번들에 박혀 배포되는 것. 한 번 나가면 회수가 안 되고 키를 폐기·재발급하는 수밖에
없다. 그래서 리뷰에 맡기지 않고 소스 트리를 직접 훑는다.

- `process.env.NEXT_PUBLIC_*` 를 읽는 파일이 있으면 실패
- `NX_API_KEY` 를 `src/lib/env.ts` 밖에서 읽으면 실패
- `'use client'` 파일에서 import 그래프를 따라가 `server-only` 모듈에 닿으면 실패
  (타입 전용 import 는 컴파일 때 지워지므로 제외한다)
- 키처럼 생긴 문자열이 소스에 박혀 있으면 실패

실패 시에는 `AssetPanel.tsx → service.ts → env.ts` 처럼 **경로를 그대로 출력**한다.

### CI

`.github/workflows/ci.yml` 이 푸시·PR 마다 네 가지를 순서대로 돌린다:
타입체크 → 린트 → 테스트 → 프로덕션 빌드. 빌드는 `NX_API_KEY` 를 비운 채로
돌려서, 키가 없는 기여자도 저장소를 받아 바로 빌드할 수 있음을 보장한다.

---

## 7. 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `NX_API_KEY` | (없음) | 넥슨 Open API 키. **서버 전용** |
| `NX_API_BASE` | `https://open.api.nexon.com` | API 베이스 URL |
| `FC_ALLOW_MOCK` | `true` | 실패 시 목업 대체 여부 |
| `FC_PACK_SEED` | (없음) | 상자 추첨 고정 시드 (재현용) |

---

## 8. 배포 (Vercel)

이 앱은 리포지토리 루트가 아니라 **`fc-squad-maker/` 하위**에 있다. Vercel 은 기본적으로
리포지토리 루트에서 `package.json` 을 찾으므로, 아무 설정 없이 연결하면 빌드 대상을
찾지 못하고 실패한다. 둘 중 하나로 해결한다.

### A. Root Directory 설정 (권장)

Vercel 이 `fc-squad-maker` 를 프로젝트 루트로 취급하게 만든다. Next.js 자동 감지와
서버리스 함수 경로가 전부 정상으로 잡히므로 가장 안전하다.

- **새로 연결**: [vercel.com/new](https://vercel.com/new) → 리포지토리 Import →
  *Configure Project* 에서 **Root Directory → Edit → `fc-squad-maker`** → Deploy
- **이미 연결돼 실패 중**: **Settings → General → Root Directory** 에 `fc-squad-maker`
  입력 → Save → **Deployments → ⋯ → Redeploy**

### B. 루트 `vercel.json` (대시보드를 못 건드릴 때)

리포지토리 루트의 `vercel.json` 이 빌드를 하위 디렉토리로 넘긴다. Root Directory 가
루트인 상태 그대로도 배포가 통과한다.

```json
{
  "framework": "nextjs",
  "installCommand": "cd fc-squad-maker && npm ci",
  "buildCommand": "cd fc-squad-maker && npm run build",
  "outputDirectory": "fc-squad-maker/.next"
}
```

Root Directory 를 설정하면 Vercel 은 `fc-squad-maker/vercel.json` 을 읽고 루트의
`vercel.json` 은 무시하므로, 두 방법을 같이 둬도 충돌하지 않는다.

### 환경 변수

**변수를 하나도 넣지 않아도 배포는 성공하고 화면도 뜬다** — 키가 없으면 `FC_ALLOW_MOCK`
기본값(`true`)에 따라 데모 데이터로 동작하고 헤더에 "데모 모드" 배지가 붙는다.
실데이터를 붙이려면 **Settings → Environment Variables** 에 7절의 변수를 넣고
**Redeploy** 한다. `NEXT_PUBLIC_` 접두사는 절대 붙이지 않는다 (7절 참고).

배포 후 `/api/health` 를 열면 키 인식 여부(`apiKeyConfigured`)와 메타 출처
(`metaSource`)를 확인할 수 있다.

---

## 9. 고지

넥슨 FC 온라인 Open API 를 이용한 **비공식 팬 프로젝트**입니다.
상자 개봉은 실제 결제·아이템 획득과 무관한 **시뮬레이션**이며, 표시되는 확률은
이 프로젝트가 정의한 샘플 값입니다. 실제 확률은 게임 내 &lsquo;확률 공개&rsquo;
페이지의 공시를 확인하세요.
