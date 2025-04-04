// hooks/index.ts

// 모든 import 문은 파일 상단에 배치
import { useCVEList, useCVEListQuery } from './query/useCVEListQuery';
import { useCVEDetail, useCVERefresh } from './query/useCVEDetailQuery';
import { useCVEStats, useTotalCVECount } from './query/useCVEStatsQuery';
import { useCVESubscription } from './socket/useCVESubscription';
import { useCVEListUpdates } from './socket/useCVEListSocketUpdates';
import { handleCVESubscriptionUpdate } from './socket/cveHandlers';
import * as mutations from './useCVEMutation';

// 개별 export
export { useCVEList, useCVEListQuery } from './query/useCVEListQuery';
export { useCVEDetail, useCVERefresh } from './query/useCVEDetailQuery';
export { useCVEStats, useTotalCVECount } from './query/useCVEStatsQuery';
export { useCVESubscription } from './socket/useCVESubscription';
export { useCVEListUpdates } from './socket/useCVEListSocketUpdates';
export { handleCVESubscriptionUpdate } from './socket/cveHandlers';

// 기존 mutation 파일 그대로 사용 (export 재내보내기)
export * from './useCVEMutation';

// 모든 훅을 기본 내보내기로 포함
export default {
  useCVEList,
  useCVEListQuery,
  useCVEDetail,
  useCVERefresh,
  useCVEStats,
  useTotalCVECount,
  useCVESubscription,
  useCVEListUpdates,
  handleCVESubscriptionUpdate,
  ...mutations
};