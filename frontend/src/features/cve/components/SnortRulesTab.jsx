import React, { memo } from 'react';
import GenericDataTab from './GenericDataTab';
import { snortRulesTabConfig } from './tabConfigs';

// 이전 버전과의 호환성을 위한 래퍼 컴포넌트
const SnortRulesTab = memo((props) => {
  return <GenericDataTab {...props} tabConfig={snortRulesTabConfig} />;
});

export default SnortRulesTab;
