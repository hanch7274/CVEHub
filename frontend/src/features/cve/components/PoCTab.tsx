import React, { memo } from 'react';
import GenericDataTab from './GenericDataTab';
import { pocTabConfig } from './tabConfigs';
import { CVEDetail, SnortRule, GenericDataTabBaseProps, GenericDataTabProps, SnortRuleTabProps } from '../types/cve';

// SnortRuleTab 컴포넌트의 props 인터페이스 - types/cve.ts에 정의된 GenericDataTabBaseProps 사용

// 이전 버전과의 호환성을 위한 래퍼 컴포넌트
const pocTab: React.FC<SnortRuleTabProps> = memo((props) => {
  // GenericDataTab이 JavaScript로 작성되어 있어 타입스크립트 인터페이스와 호환되지 않음
  // any 타입으로 단언하여 타입 오류 해결
  return React.createElement(GenericDataTab as any, {
    ...props,
    tabConfig: pocTabConfig
  });
});

// displayName 설정 (React DevTools에서 디버깅 시 유용)
pocTab.displayName = 'SnortRuleTab';

export default pocTab;