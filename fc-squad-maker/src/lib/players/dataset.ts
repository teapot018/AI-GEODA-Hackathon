import type { PlayerProfile } from './types';

/**
 * ── 로컬 선수 시드 데이터 — **계층 C (이 프로젝트가 적은 값)** ──
 *
 * 왜 로컬 데이터가 필요한가:
 *   넥슨 Open API 의 공개 메타(spid.json)는 `{ id, name }` 두 필드뿐이다.
 *   즉 "어떤 선수 카드가 존재하는가"는 공식 API 로 알 수 있지만,
 *   페이스/슛/패스 같은 세부 능력치와 오버롤은 공개 API 에 없다.
 *
 * 그래서 이 앱은 이렇게 나눈다:
 *   - 카드 목록 / 이름 / 시즌 / 이미지 → 넥슨 공식 메타 (계층 A)
 *   - 능력치 / 오버롤 / 가치         → 이 시드 파일 + 추정 모델 (계층 C)
 *
 * ── 아래 숫자는 실측이 아니다 ──
 * 한때 이 주석은 아래 값을 "실측 스탯" 이라고 불렀다. 아니다. 사람이
 * 손으로 적어 넣은 표이고, 게임 화면과 대조해 검증한 적이 없다. 손으로
 * 적었다고 공식이 되지 않으므로 statSource 는 'project-seed' 이고,
 * 화면에도 추정으로 표기된다(players/types.ts 주석 참고).
 *
 * ── 여기 이름이 있다고 카드가 생기지는 않는다 ──
 * 카탈로그는 넥슨 메타의 spid 목록으로만 만들어지고(catalog.ts), 이
 * 파일은 그 카드에 능력치를 붙일 뿐이다. 즉 여기 없는 선수도 카드로
 * 뜨고(추정 프로필이 붙는다), 여기 있는 선수라도 넥슨 목록에 없으면
 * 뜨지 않는다 — 우리가 적은 이름이 실재하지 않는 카드로 둔갑하지
 * 않게 하는 것이 이 방향의 요점이다.
 *
 * 다만 넥슨 메타를 받지 못해 **데모 카탈로그**로 떨어지면 spid 를 이
 * 파일의 이름으로 만들어 내므로, 그때 뜨는 카드 조합은 실제 게임에
 * 존재한다는 보장이 없다. 그 경우 화면에 데모 경고가 뜬다.
 *
 * 조인 키는 **선수 이름**이다. spid.json 의 한글 표기와 아래 name 이
 * 일치하면 이 프로필이 붙고, 없으면 estimateProfile() 이 포지션 기반
 * 추정치를 만들어 넣는다. 실서비스에서는 이 파일을 자체 DB 로 교체하면
 * 나머지 코드는 손댈 필요가 없다.
 */
export const PLAYER_SEED: PlayerProfile[] = [
  // ── GK ─────────────────────────────────────────────
  { name: '알리송', aliases: ['Alisson'], nation: '브라질', club: '리버풀', league: '프리미어리그', positions: ['GK'], baseOvr: 89, foot: '오른발', skillMoves: 1, weakFoot: 3,
    stats: { pace: 56, shooting: 40, passing: 65, dribbling: 62, defending: 32, physical: 78 },
    gk: { diving: 89, handling: 85, kicking: 86, reflexes: 90, speed: 55, positioning: 88 } },
  { name: '노이어', aliases: ['Neuer'], nation: '독일', club: '바이에른 뮌헨', league: '분데스리가', positions: ['GK'], baseOvr: 88, foot: '오른발', skillMoves: 1, weakFoot: 4,
    stats: { pace: 60, shooting: 45, passing: 70, dribbling: 68, defending: 35, physical: 80 },
    gk: { diving: 87, handling: 86, kicking: 90, reflexes: 88, speed: 60, positioning: 87 } },
  { name: '쿠르투아', aliases: ['Courtois'], nation: '벨기에', club: '레알 마드리드', league: '라리가', positions: ['GK'], baseOvr: 90, foot: '왼발', skillMoves: 1, weakFoot: 3,
    stats: { pace: 52, shooting: 38, passing: 62, dribbling: 58, defending: 30, physical: 82 },
    gk: { diving: 91, handling: 88, kicking: 78, reflexes: 92, speed: 51, positioning: 90 } },
  { name: '조현우', aliases: ['Jo Hyeonwoo'], nation: '대한민국', club: '울산', league: 'K리그', positions: ['GK'], baseOvr: 82, foot: '오른발', skillMoves: 1, weakFoot: 3,
    stats: { pace: 55, shooting: 35, passing: 55, dribbling: 52, defending: 28, physical: 74 },
    gk: { diving: 83, handling: 80, kicking: 72, reflexes: 85, speed: 54, positioning: 80 } },

  // ── 수비수 ──────────────────────────────────────────
  { name: '판 다이크', aliases: ['Van Dijk', '반다이크'], nation: '네덜란드', club: '리버풀', league: '프리미어리그', positions: ['CB', 'LCB'], baseOvr: 90, foot: '오른발', skillMoves: 2, weakFoot: 3,
    stats: { pace: 79, shooting: 60, passing: 71, dribbling: 72, defending: 90, physical: 86 } },
  { name: '마르퀴뇨스', aliases: ['Marquinhos'], nation: '브라질', club: 'PSG', league: '리그앙', positions: ['CB', 'RCB', 'CDM'], baseOvr: 88, foot: '오른발', skillMoves: 2, weakFoot: 3,
    stats: { pace: 82, shooting: 55, passing: 74, dribbling: 76, defending: 87, physical: 80 } },
  { name: '루벤 디아스', aliases: ['Ruben Dias'], nation: '포르투갈', club: '맨체스터 시티', league: '프리미어리그', positions: ['CB'], baseOvr: 88, foot: '오른발', skillMoves: 2, weakFoot: 3,
    stats: { pace: 71, shooting: 48, passing: 70, dribbling: 68, defending: 89, physical: 87 } },
  { name: '김민재', aliases: ['Kim Minjae'], nation: '대한민국', club: '바이에른 뮌헨', league: '분데스리가', positions: ['CB', 'RCB'], baseOvr: 86, foot: '오른발', skillMoves: 2, weakFoot: 3,
    stats: { pace: 82, shooting: 46, passing: 66, dribbling: 68, defending: 86, physical: 88 } },
  { name: '알라바', aliases: ['Alaba'], nation: '오스트리아', club: '레알 마드리드', league: '라리가', positions: ['LCB', 'CB', 'LB'], baseOvr: 86, foot: '왼발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 78, shooting: 70, passing: 82, dribbling: 79, defending: 84, physical: 78 } },
  { name: '알렉산더 아놀드', aliases: ['Alexander-Arnold', 'TAA'], nation: '잉글랜드', club: '리버풀', league: '프리미어리그', positions: ['RB', 'RWB', 'RM'], baseOvr: 87, foot: '오른발', skillMoves: 3, weakFoot: 4,
    stats: { pace: 80, shooting: 71, passing: 90, dribbling: 80, defending: 80, physical: 74 } },
  { name: '칸셀루', aliases: ['Cancelo'], nation: '포르투갈', club: '바르셀로나', league: '라리가', positions: ['RB', 'LB', 'RWB'], baseOvr: 86, foot: '오른발', skillMoves: 4, weakFoot: 3,
    stats: { pace: 86, shooting: 72, passing: 85, dribbling: 87, defending: 78, physical: 72 } },
  { name: '테오 에르난데스', aliases: ['Theo Hernandez'], nation: '프랑스', club: 'AC 밀란', league: '세리에A', positions: ['LB', 'LWB', 'LM'], baseOvr: 86, foot: '왼발', skillMoves: 4, weakFoot: 3,
    stats: { pace: 92, shooting: 74, passing: 79, dribbling: 84, defending: 77, physical: 82 } },
  { name: '마르셀루', aliases: ['Marcelo'], nation: '브라질', club: '레알 마드리드', league: '라리가', positions: ['LB', 'LWB'], baseOvr: 87, foot: '왼발', skillMoves: 5, weakFoot: 4,
    stats: { pace: 84, shooting: 74, passing: 85, dribbling: 90, defending: 76, physical: 70 } },
  { name: '카푸', aliases: ['Cafu'], nation: '브라질', club: 'AC 밀란', league: '세리에A', positions: ['RB', 'RWB'], baseOvr: 88, foot: '오른발', skillMoves: 4, weakFoot: 3,
    stats: { pace: 91, shooting: 70, passing: 81, dribbling: 86, defending: 84, physical: 79 } },
  { name: '말디니', aliases: ['Maldini'], nation: '이탈리아', club: 'AC 밀란', league: '세리에A', positions: ['LCB', 'CB', 'LB'], baseOvr: 91, foot: '오른발', skillMoves: 3, weakFoot: 4,
    stats: { pace: 83, shooting: 60, passing: 79, dribbling: 80, defending: 92, physical: 85 } },

  // ── 미드필더 ────────────────────────────────────────
  { name: '카세미루', aliases: ['Casemiro'], nation: '브라질', club: '맨체스터 유나이티드', league: '프리미어리그', positions: ['CDM', 'CM'], baseOvr: 87, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 68, shooting: 76, passing: 79, dribbling: 76, defending: 88, physical: 90 } },
  { name: '로드리', aliases: ['Rodri'], nation: '스페인', club: '맨체스터 시티', league: '프리미어리그', positions: ['CDM', 'CM'], baseOvr: 89, foot: '오른발', skillMoves: 2, weakFoot: 3,
    stats: { pace: 66, shooting: 78, passing: 86, dribbling: 82, defending: 87, physical: 86 } },
  { name: '크로스', aliases: ['Kroos'], nation: '독일', club: '레알 마드리드', league: '라리가', positions: ['CM', 'LCM', 'CDM'], baseOvr: 89, foot: '오른발', skillMoves: 3, weakFoot: 4,
    stats: { pace: 62, shooting: 82, passing: 92, dribbling: 84, defending: 74, physical: 76 } },
  { name: '모드리치', aliases: ['Modric'], nation: '크로아티아', club: '레알 마드리드', league: '라리가', positions: ['CM', 'RCM', 'CAM'], baseOvr: 89, foot: '오른발', skillMoves: 4, weakFoot: 4,
    stats: { pace: 74, shooting: 79, passing: 89, dribbling: 89, defending: 72, physical: 66 } },
  { name: '데 브라이너', aliases: ['De Bruyne', '데브라이너'], nation: '벨기에', club: '맨체스터 시티', league: '프리미어리그', positions: ['CAM', 'RCM', 'CM'], baseOvr: 92, foot: '오른발', skillMoves: 4, weakFoot: 5,
    stats: { pace: 76, shooting: 88, passing: 94, dribbling: 88, defending: 65, physical: 78 } },
  { name: '지단', aliases: ['Zidane'], nation: '프랑스', club: '레알 마드리드', league: '라리가', positions: ['CAM', 'CM'], baseOvr: 93, foot: '오른발', skillMoves: 5, weakFoot: 4,
    stats: { pace: 78, shooting: 86, passing: 92, dribbling: 94, defending: 66, physical: 80 } },
  { name: '이강인', aliases: ['Lee Kangin'], nation: '대한민국', club: 'PSG', league: '리그앙', positions: ['CAM', 'RM', 'RW'], baseOvr: 84, foot: '왼발', skillMoves: 4, weakFoot: 3,
    stats: { pace: 76, shooting: 79, passing: 85, dribbling: 87, defending: 55, physical: 62 } },
  { name: '베르캄프', aliases: ['Bergkamp'], nation: '네덜란드', club: '아스날', league: '프리미어리그', positions: ['CF', 'CAM'], baseOvr: 91, foot: '오른발', skillMoves: 4, weakFoot: 4,
    stats: { pace: 78, shooting: 89, passing: 89, dribbling: 91, defending: 46, physical: 76 } },
  { name: '제라드', aliases: ['Gerrard'], nation: '잉글랜드', club: '리버풀', league: '프리미어리그', positions: ['CM', 'CAM', 'RCM'], baseOvr: 90, foot: '오른발', skillMoves: 4, weakFoot: 4,
    stats: { pace: 79, shooting: 89, passing: 90, dribbling: 85, defending: 79, physical: 86 } },
  { name: '비에이라', aliases: ['Vieira'], nation: '프랑스', club: '아스날', league: '프리미어리그', positions: ['CDM', 'CM'], baseOvr: 89, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 76, shooting: 76, passing: 82, dribbling: 82, defending: 88, physical: 92 } },
  { name: '베컴', aliases: ['Beckham'], nation: '잉글랜드', club: '맨체스터 유나이티드', league: '프리미어리그', positions: ['RM', 'RCM', 'RW'], baseOvr: 89, foot: '오른발', skillMoves: 4, weakFoot: 4,
    stats: { pace: 76, shooting: 84, passing: 93, dribbling: 84, defending: 66, physical: 76 } },

  // ── 공격수 / 윙어 ───────────────────────────────────
  { name: '손흥민', aliases: ['Son Heungmin', 'Son'], nation: '대한민국', club: '토트넘', league: '프리미어리그', positions: ['LW', 'ST', 'LM'], baseOvr: 89, foot: '오른발', skillMoves: 4, weakFoot: 5,
    stats: { pace: 89, shooting: 89, passing: 82, dribbling: 87, defending: 44, physical: 76 } },
  { name: '음바페', aliases: ['Mbappe'], nation: '프랑스', club: '레알 마드리드', league: '라리가', positions: ['ST', 'LW', 'LS'], baseOvr: 92, foot: '오른발', skillMoves: 5, weakFoot: 4,
    stats: { pace: 97, shooting: 90, passing: 80, dribbling: 92, defending: 36, physical: 78 } },
  { name: '홀란드', aliases: ['Haaland', '홀란'], nation: '노르웨이', club: '맨체스터 시티', league: '프리미어리그', positions: ['ST'], baseOvr: 91, foot: '왼발', skillMoves: 3, weakFoot: 4,
    stats: { pace: 89, shooting: 94, passing: 65, dribbling: 80, defending: 45, physical: 90 } },
  { name: '메시', aliases: ['Messi'], nation: '아르헨티나', club: '인터 마이애미', league: 'MLS', positions: ['RW', 'CF', 'CAM'], baseOvr: 93, foot: '왼발', skillMoves: 4, weakFoot: 4,
    stats: { pace: 80, shooting: 89, passing: 91, dribbling: 94, defending: 34, physical: 64 } },
  { name: '호날두', aliases: ['Ronaldo', 'CR7'], nation: '포르투갈', club: '알 나스르', league: '기타', positions: ['ST', 'LW'], baseOvr: 91, foot: '오른발', skillMoves: 5, weakFoot: 4,
    stats: { pace: 85, shooting: 93, passing: 78, dribbling: 85, defending: 34, physical: 77 } },
  { name: '호나우두', aliases: ['R9', 'Ronaldo Nazario'], nation: '브라질', club: '레알 마드리드', league: '라리가', positions: ['ST', 'CF'], baseOvr: 93, foot: '오른발', skillMoves: 5, weakFoot: 4,
    stats: { pace: 95, shooting: 93, passing: 76, dribbling: 93, defending: 32, physical: 82 } },
  { name: '앙리', aliases: ['Henry'], nation: '프랑스', club: '아스날', league: '프리미어리그', positions: ['ST', 'LW'], baseOvr: 91, foot: '오른발', skillMoves: 5, weakFoot: 4,
    stats: { pace: 94, shooting: 90, passing: 80, dribbling: 90, defending: 40, physical: 79 } },
  { name: '비니시우스', aliases: ['Vinicius', '비니'], nation: '브라질', club: '레알 마드리드', league: '라리가', positions: ['LW', 'LM', 'ST'], baseOvr: 89, foot: '오른발', skillMoves: 5, weakFoot: 4,
    stats: { pace: 95, shooting: 83, passing: 78, dribbling: 92, defending: 30, physical: 70 } },
  { name: '살라', aliases: ['Salah'], nation: '이집트', club: '리버풀', league: '프리미어리그', positions: ['RW', 'ST', 'RM'], baseOvr: 89, foot: '왼발', skillMoves: 4, weakFoot: 3,
    stats: { pace: 90, shooting: 88, passing: 81, dribbling: 88, defending: 45, physical: 76 } },
  { name: '레반도프스키', aliases: ['Lewandowski'], nation: '폴란드', club: '바르셀로나', league: '라리가', positions: ['ST'], baseOvr: 90, foot: '오른발', skillMoves: 4, weakFoot: 4,
    stats: { pace: 78, shooting: 92, passing: 79, dribbling: 85, defending: 44, physical: 83 } },
  { name: '벤제마', aliases: ['Benzema'], nation: '프랑스', club: '알 이티하드', league: '기타', positions: ['ST', 'CF'], baseOvr: 90, foot: '오른발', skillMoves: 4, weakFoot: 4,
    stats: { pace: 79, shooting: 89, passing: 84, dribbling: 88, defending: 40, physical: 78 } },
  { name: '네이마르', aliases: ['Neymar'], nation: '브라질', club: '산투스', league: '기타', positions: ['LW', 'CAM', 'CF'], baseOvr: 89, foot: '오른발', skillMoves: 5, weakFoot: 5,
    stats: { pace: 87, shooting: 83, passing: 86, dribbling: 93, defending: 36, physical: 62 } },
  { name: '카카', aliases: ['Kaka'], nation: '브라질', club: 'AC 밀란', league: '세리에A', positions: ['CAM', 'CF', 'CM'], baseOvr: 90, foot: '오른발', skillMoves: 4, weakFoot: 4,
    stats: { pace: 88, shooting: 87, passing: 86, dribbling: 90, defending: 45, physical: 78 } },
  { name: '드로그바', aliases: ['Drogba'], nation: '코트디부아르', club: '첼시', league: '프리미어리그', positions: ['ST'], baseOvr: 89, foot: '오른발', skillMoves: 3, weakFoot: 4,
    stats: { pace: 84, shooting: 90, passing: 74, dribbling: 82, defending: 44, physical: 92 } },
  { name: '박지성', aliases: ['Park Jisung'], nation: '대한민국', club: '맨체스터 유나이티드', league: '프리미어리그', positions: ['RM', 'LM', 'CM'], baseOvr: 85, foot: '오른발', skillMoves: 3, weakFoot: 4,
    stats: { pace: 88, shooting: 76, passing: 80, dribbling: 84, defending: 72, physical: 80 } },
  { name: '황희찬', aliases: ['Hwang Heechan'], nation: '대한민국', club: '울버햄튼', league: '프리미어리그', positions: ['LW', 'ST'], baseOvr: 82, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 90, shooting: 79, passing: 71, dribbling: 80, defending: 42, physical: 78 } },

  // ── 중·저오버롤 (상자 시뮬레이터의 일반/레어 등급 풀) ────
  //   상위 카드만 있으면 낮은 등급 풀이 비어 확률 분포가 왜곡되므로
  //   OVR 60~79 대의 선수도 함께 넣는다.
  { name: '김승규', aliases: ['Kim Seunggyu'], nation: '대한민국', club: '알 샤밥', league: '기타', positions: ['GK'], baseOvr: 78, foot: '오른발', skillMoves: 1, weakFoot: 3,
    stats: { pace: 52, shooting: 32, passing: 52, dribbling: 48, defending: 26, physical: 70 },
    gk: { diving: 79, handling: 76, kicking: 70, reflexes: 80, speed: 50, positioning: 77 } },
  { name: '구성윤', aliases: ['Ku Sungyun'], nation: '대한민국', club: '김천', league: 'K리그', positions: ['GK'], baseOvr: 70, foot: '오른발', skillMoves: 1, weakFoot: 2,
    stats: { pace: 48, shooting: 28, passing: 46, dribbling: 42, defending: 22, physical: 64 },
    gk: { diving: 71, handling: 68, kicking: 62, reflexes: 72, speed: 46, positioning: 69 } },
  { name: '김영권', aliases: ['Kim Younggwon'], nation: '대한민국', club: '울산', league: 'K리그', positions: ['CB', 'LCB'], baseOvr: 76, foot: '왼발', skillMoves: 2, weakFoot: 3,
    stats: { pace: 68, shooting: 42, passing: 62, dribbling: 60, defending: 77, physical: 78 } },
  { name: '정승현', aliases: ['Jung Seunghyun'], nation: '대한민국', club: '울산', league: 'K리그', positions: ['CB', 'RCB'], baseOvr: 71, foot: '오른발', skillMoves: 2, weakFoot: 2,
    stats: { pace: 66, shooting: 38, passing: 56, dribbling: 54, defending: 72, physical: 75 } },
  { name: '김진수', aliases: ['Kim Jinsu'], nation: '대한민국', club: '전북', league: 'K리그', positions: ['LB', 'LWB'], baseOvr: 76, foot: '왼발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 80, shooting: 60, passing: 74, dribbling: 74, defending: 73, physical: 70 } },
  { name: '설영우', aliases: ['Seol Youngwoo'], nation: '대한민국', club: '츠르베나 즈베즈다', league: '기타', positions: ['RB', 'LB', 'RWB'], baseOvr: 74, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 82, shooting: 55, passing: 71, dribbling: 74, defending: 70, physical: 66 } },
  { name: '홍철', aliases: ['Hong Chul'], nation: '대한민국', club: '대구', league: 'K리그', positions: ['LB', 'LWB', 'LM'], baseOvr: 72, foot: '왼발', skillMoves: 3, weakFoot: 2,
    stats: { pace: 78, shooting: 58, passing: 70, dribbling: 71, defending: 66, physical: 64 } },
  { name: '박용우', aliases: ['Park Yongwoo'], nation: '대한민국', club: '알 아인', league: '기타', positions: ['CDM', 'CM'], baseOvr: 73, foot: '오른발', skillMoves: 2, weakFoot: 3,
    stats: { pace: 62, shooting: 58, passing: 71, dribbling: 68, defending: 74, physical: 76 } },
  { name: '백승호', aliases: ['Paik Seungho'], nation: '대한민국', club: '버밍엄', league: '기타', positions: ['CM', 'CDM'], baseOvr: 76, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 66, shooting: 72, passing: 78, dribbling: 76, defending: 70, physical: 72 } },
  { name: '정우영', aliases: ['Jeong Wooyeong'], nation: '대한민국', club: '우니온 베를린', league: '분데스리가', positions: ['LM', 'CAM', 'LW'], baseOvr: 78, foot: '오른발', skillMoves: 4, weakFoot: 3,
    stats: { pace: 82, shooting: 74, passing: 76, dribbling: 82, defending: 48, physical: 62 } },
  { name: '이승우', aliases: ['Lee Seungwoo'], nation: '대한민국', club: '수원FC', league: 'K리그', positions: ['CAM', 'RW', 'ST'], baseOvr: 75, foot: '왼발', skillMoves: 4, weakFoot: 3,
    stats: { pace: 84, shooting: 74, passing: 72, dribbling: 83, defending: 36, physical: 58 } },
  { name: '문선민', aliases: ['Moon Seonmin'], nation: '대한민국', club: '전북', league: 'K리그', positions: ['RW', 'LW'], baseOvr: 71, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 88, shooting: 66, passing: 64, dribbling: 74, defending: 38, physical: 60 } },
  { name: '고영준', aliases: ['Ko Youngjun'], nation: '대한민국', club: '포항', league: 'K리그', positions: ['CAM', 'RM'], baseOvr: 69, foot: '오른발', skillMoves: 3, weakFoot: 2,
    stats: { pace: 76, shooting: 64, passing: 68, dribbling: 74, defending: 42, physical: 56 } },
  { name: '엄지성', aliases: ['Um Jisung'], nation: '대한민국', club: '스완지', league: '기타', positions: ['LW', 'RW'], baseOvr: 70, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 85, shooting: 62, passing: 62, dribbling: 76, defending: 34, physical: 58 } },
  { name: '조규성', aliases: ['Cho Guesung'], nation: '대한민국', club: '미트윌란', league: '기타', positions: ['ST'], baseOvr: 77, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 78, shooting: 78, passing: 62, dribbling: 70, defending: 40, physical: 82 } },
  { name: '오현규', aliases: ['Oh Hyeongyu'], nation: '대한민국', club: '헹크', league: '기타', positions: ['ST'], baseOvr: 72, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 84, shooting: 71, passing: 55, dribbling: 68, defending: 32, physical: 74 } },
  { name: '나상호', aliases: ['Na Sangho'], nation: '대한민국', club: 'FC서울', league: 'K리그', positions: ['RW', 'ST', 'LW'], baseOvr: 74, foot: '왼발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 86, shooting: 71, passing: 64, dribbling: 76, defending: 36, physical: 62 } },
  { name: '송민규', aliases: ['Song Minkyu'], nation: '대한민국', club: '전북', league: 'K리그', positions: ['LW', 'CAM'], baseOvr: 73, foot: '오른발', skillMoves: 3, weakFoot: 3,
    stats: { pace: 80, shooting: 70, passing: 68, dribbling: 76, defending: 38, physical: 62 } },
  { name: '이순민', aliases: ['Lee Soonmin'], nation: '대한민국', club: '광주', league: 'K리그', positions: ['CDM', 'CM'], baseOvr: 68, foot: '오른발', skillMoves: 2, weakFoot: 2,
    stats: { pace: 64, shooting: 52, passing: 64, dribbling: 62, defending: 70, physical: 70 } },
  { name: '양현준', aliases: ['Yang Hyunjun'], nation: '대한민국', club: '셀틱', league: '기타', positions: ['RW', 'LW'], baseOvr: 71, foot: '오른발', skillMoves: 4, weakFoot: 2,
    stats: { pace: 89, shooting: 62, passing: 60, dribbling: 78, defending: 32, physical: 56 } },
  { name: '황인범', aliases: ['Hwang Inbeom'], nation: '대한민국', club: '페예노르트', league: '기타', positions: ['CM', 'CDM', 'CAM'], baseOvr: 79, foot: '오른발', skillMoves: 3, weakFoot: 4,
    stats: { pace: 70, shooting: 72, passing: 81, dribbling: 79, defending: 68, physical: 68 } },
  { name: '주민규', aliases: ['Joo Minkyu'], nation: '대한민국', club: '대전', league: 'K리그', positions: ['ST'], baseOvr: 75, foot: '오른발', skillMoves: 2, weakFoot: 3,
    stats: { pace: 68, shooting: 78, passing: 60, dribbling: 68, defending: 34, physical: 78 } },
];
