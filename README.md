# AI-GEODA-Hackathon

AI-GEODA 해커톤 - 학교 안전 프로젝트

## 하위 프로젝트

| 디렉토리 | 설명 |
| --- | --- |
| [`demo/`](./demo) | **바로 열어 보는 단독 실행본.** `demo/index.html` 을 더블클릭하면 설치 없이 동작합니다. |
| [`fc-squad-maker/`](./fc-squad-maker) | 넥슨 FC 온라인 Open API 기반 구단주 조회 · 스쿼드 메이커 · 시세 관측소 · 모의 상자 개봉 시뮬레이터 (Next.js 15 + TypeScript + Tailwind) |

---

## Vercel 배포

앱은 리포지토리 루트가 아니라 **`fc-squad-maker/` 하위**에 있습니다. Vercel 은 기본적으로
리포지토리 루트에서 `package.json` 을 찾기 때문에, 아무 설정 없이 연결하면
빌드할 대상을 찾지 못하고 실패합니다.

해결 방법은 두 가지이고, **A 를 권장**합니다.

### A. Root Directory 설정 (권장)

Vercel 이 `fc-squad-maker` 를 프로젝트 루트로 취급하게 만드는 방법입니다.
Next.js 자동 감지 · 서버리스 함수 · 이미지 최적화가 전부 정상 경로를 타므로 가장 안전합니다.

**새로 연결하는 경우**

1. [vercel.com/new](https://vercel.com/new) → **Add New… → Project**
2. **Import Git Repository** 에서 `teapot018/AI-GEODA-Hackathon` 선택
3. *Configure Project* 화면에서 **Root Directory** 항목의 **Edit** 클릭
4. 디렉토리 목록에서 **`fc-squad-maker`** 선택 → **Continue**
5. Framework Preset 이 **Next.js** 로 자동 인식되는지 확인
6. **Deploy**

**이미 연결돼 있는데 실패 중인 경우** (현재 상태)

1. Vercel 프로젝트 → **Settings → General**
2. **Root Directory** 를 `fc-squad-maker` 로 입력 → **Save**
3. **Deployments** 탭 → 최신 배포 우측 **⋯ → Redeploy**

> Root Directory 를 설정하면 Vercel 은 `fc-squad-maker/vercel.json` 을 읽고
> 리포지토리 루트의 `vercel.json` 은 무시합니다. 두 방법이 서로 충돌하지 않습니다.

### B. 루트 `vercel.json` (대시보드를 못 건드릴 때)

리포지토리 루트의 [`vercel.json`](./vercel.json) 이 빌드를 하위 디렉토리로 넘깁니다.
Root Directory 가 루트인 상태 그대로도 배포가 통과합니다.

```json
{
  "framework": "nextjs",
  "installCommand": "cd fc-squad-maker && npm ci",
  "buildCommand": "cd fc-squad-maker && npm run build",
  "outputDirectory": "fc-squad-maker/.next"
}
```

### 환경 변수

**환경 변수를 하나도 넣지 않아도 배포는 성공하고 화면도 정상적으로 뜹니다** —
API 키가 없으면 `FC_ALLOW_MOCK` 기본값(`true`)에 따라 데모(목업) 데이터로 동작하고,
화면에는 "데모 데이터" 배지가 붙습니다.

실제 넥슨 데이터를 붙이려면 **Settings → Environment Variables** 에서:

| 변수 | 필수 | 값 | 설명 |
| --- | --- | --- | --- |
| `NX_API_KEY` | 선택 | 넥슨 발급 키 | 없으면 데모 모드. [openapi.nexon.com](https://openapi.nexon.com) 에서 발급 |
| `FC_ALLOW_MOCK` | 선택 | `true` / `false` | API 실패 시 목업 대체 여부. 운영에서 실패를 숨기고 싶지 않으면 `false` |
| `NX_API_BASE` | 선택 | `https://open.api.nexon.com` | 보통 바꿀 일 없음 |

> `NEXT_PUBLIC_` 접두사를 **붙이지 마세요.** 그 접두사가 붙은 값은 클라이언트 번들에
> 문자열로 인라인되어 배포 즉시 누구나 devtools 에서 꺼내 쓸 수 있습니다.
> 모든 넥슨 호출은 서버 사이드 `/api/*` 프록시 라우트를 거치도록 되어 있습니다.

변수를 추가·변경한 뒤에는 **Redeploy** 를 해야 반영됩니다.

### 배포 확인

배포 URL 에서 `/api/health` 를 열면 키 인식 여부와 동작 모드를 확인할 수 있습니다.
