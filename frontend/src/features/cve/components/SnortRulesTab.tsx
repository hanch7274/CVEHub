import React, { memo } from 'react';
import GenericDataTab from './GenericDataTab';
import { snortRulesTabConfig } from './tabConfigs';
import { CVEDetail, SnortRule, GenericDataTabBaseProps, GenericDataTabProps, SnortRulesTabProps } from '../types/cve';

// SnortRulesTab 컴포넌트의 props 인터페이스 - types/cve.ts에 정의된 GenericDataTabBaseProps 사용

// 이전 버전과의 호환성을 위한 래퍼 컴포넌트
const SnortRulesTab: React.FC<SnortRulesTabProps> = memo((props) => {
  // GenericDataTab이 JavaScript로 작성되어 있어 타입스크립트 인터페이스와 호환되지 않음
  // any 타입으로 단언하여 타입 오류 해결
  return React.createElement(GenericDataTab as any, {
    ...props,
    tabConfig: snortRulesTabConfig
  });
});

// displayName 설정 (React DevTools에서 디버깅 시 유용)
SnortRulesTab.displayName = 'SnortRulesTab';

export default SnortRulesTab;