import React, { memo } from 'react';
import GenericDataTab from './GenericDataTab';
import { pocTabConfig } from './tabConfigs';

// 이전 버전과의 호환성을 위한 래퍼 컴포넌트
const PoCTab = memo((props) => {
  return <GenericDataTab {...props} tabConfig={pocTabConfig} />;
});

export default PoCTab;
