import { hasApiKey } from '@/lib/env';
import { loadMeta } from '@/lib/nexon/meta';
import { ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

/** 설정 상태 점검용. UI 상단 배너가 이 값을 보고 안내 문구를 띄운다. */
export async function GET() {
  const meta = await loadMeta();
  return ok({
    apiKeyConfigured: hasApiKey,
    metaSource: meta.source,
    playerCount: meta.spids.length,
    seasonCount: meta.seasons.length,
  });
}
