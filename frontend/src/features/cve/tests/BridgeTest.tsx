// src/features/cve/tests/BridgeTest.tsx
import React from 'react';
import { CVEDetail, Reference, PoC, Comment } from '../types/bridge';

/**
 * 브릿지 타입 테스트 컴포넌트
 */
const BridgeTest: React.FC = () => {
  // 테스트 객체 생성
  const testCVE: CVEDetail = {
    cveId: 'CVE-2023-1234',
    title: '테스트 CVE',
    status: '신규등록',
    createdBy: 'admin',
    lastModifiedBy: 'admin',
    createdAt: new Date(),
    reference: [],
    poc: [],
    snortRule: [],
    modificationHistory: []
  };
  
  console.log('테스트 CVE:', testCVE);
  
  return (
    <div>
      <h2>브릿지 타입 테스트</h2>
      <pre>{JSON.stringify(testCVE, null, 2)}</pre>
    </div>
  );
};

export default BridgeTest;