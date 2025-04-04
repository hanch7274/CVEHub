import React, { useState, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import ShieldIcon from '@mui/icons-material/Shield';
import LinkIcon from '@mui/icons-material/Link';
import CommentIcon from '@mui/icons-material/Comment';
import HistoryIcon from '@mui/icons-material/History';

import GenericDataTab from './components/GenericDataTab'; // 컴포넌트 경로 가정
import CommentsTab from './components/CommentsTab';     // 컴포넌트 경로 가정
import HistoryTab from './components/HistoryTab';       // 컴포넌트 경로 가정
import {
  pocTabConfig,
  snortRulesTabConfig,
  referencesTabConfig
} from './components/tabConfigs'; // 설정 파일 경로 가정

// 상수 (원래 CVEDetail에 있던 것)
// 별도 파일(constants/cveConstants.js)로 분리하는 것을 강력히 권장합니다.
const tabItemsConfig = [ // 변수명 변경 (tabConfig는 개별 탭 설정에도 사용되므로)
  { label: 'PoC', iconComponent: ScienceIcon, color: '#2196f3', hoverColor: '#1976d2', description: '증명 코드 및 취약점 검증', countKey: 'poc', component: GenericDataTab, config: pocTabConfig },
  { label: 'Snort Rules', iconComponent: ShieldIcon, color: '#4caf50', hoverColor: '#388e3c', description: '탐지 규칙 및 방어 정책', countKey: 'snortRules', component: GenericDataTab, config: snortRulesTabConfig },
  { label: 'References', iconComponent: LinkIcon, color: '#ff9800', hoverColor: '#f57c00', description: '관련 문서 및 참고 자료', countKey: 'references', component: GenericDataTab, config: referencesTabConfig },
  { label: 'Comments', iconComponent: CommentIcon, color: '#9c27b0', hoverColor: '#7b1fa2', description: '토론 및 의견 공유', countKey: 'comments', component: CommentsTab, config: null }, // CommentsTab은 자체 설정 사용
  { label: 'History', iconComponent: HistoryIcon, color: '#757575', hoverColor: '#757575', description: '수정 이력', countKey: null, component: HistoryTab, config: null } // History는 카운트/설정 없음
];
// --- 상수 끝 ---

// 탭 패널 Wrapper (스타일 재사용 위해)
const TabPanelWrapper = memo(({ children, active, index, ...other }) => (
  <Box
    sx={{
      // 활성 탭만 보이도록 display 속성 사용
      display: active ? 'block' : 'none',
      height: '100%', // 부모 요소의 남은 공간을 채우도록 설정
      // 패딩과 스크롤 스타일 적용
      p: 3,
      overflowY: 'auto',
      '&::-webkit-scrollbar': { width: '8px', backgroundColor: 'transparent' },
      '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(0, 0, 0, 0.1)', borderRadius: '4px', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.2)' } }
    }}
    role="tabpanel"
    // 접근성을 위한 속성들
    hidden={!active}
    id={`tabpanel-${index}`}
    aria-labelledby={`tab-${index}`}
    {...other}
  >
    {/* 성능을 위해 활성 탭일 때만 자식 컴포넌트 렌더링 */}
    {active && children}
  </Box>
));

TabPanelWrapper.propTypes = {
    children: PropTypes.node,
    active: PropTypes.bool.isRequired,
    index: PropTypes.number.isRequired,
};


const CVEDetailTabs = memo(({
  cveData,
  currentUser,
  refreshTriggers,
  tabCounts,
  onCountChange, // 각 탭에서 카운트 변경 시 호출할 함수
  parentSendMessage,
  highlightCommentId,
}) => {
  const [activeTab, setActiveTab] = useState(0);

  // 탭 변경 핸들러
  const handleTabChange = useCallback((event, newValue) => {
    setActiveTab(newValue);
  }, []);

  // 각 탭 컨텐츠에 전달할 onCountChange 콜백 생성
  const handleTabSpecificCountChange = useCallback((tabKey) => (count) => {
      onCountChange(tabKey, count);
  }, [onCountChange]);

  return (
    // flex: 1을 주어 남은 공간을 모두 차지하도록 함
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.paper' /* 탭 영역 배경색 */ }}>
      {/* 탭 헤더 */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="fullWidth" // 탭 너비를 동일하게 분할
        sx={{
          borderBottom: 1, // 하단 구분선
          borderColor: 'divider',
          bgcolor: 'background.paper', // 탭 헤더 배경색
          flexShrink: 0, // 탭 헤더 높이가 내용에 따라 늘어나지 않도록 고정
        }}
        aria-label="CVE Detail Tabs" // 접근성 레이블
      >
        {tabItemsConfig.map((tab, index) => (
          <Tab
            key={tab.label}
            label={
              <Box sx={{ textAlign: 'center', py: 1 /* 세로 패딩 추가 */ }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
                  {/* 아이콘 동적 생성 */}
                  {React.createElement(tab.iconComponent, { sx: { fontSize: 20 } })}
                  <Typography component="span" /* 인라인 요소로 변경 */ sx={{ fontSize: '0.9rem' /* 폰트 크기 조정 */ }}>
                    {/* 카운트 표시 (countKey가 있고, tabCounts에 해당 키가 있을 경우) */}
                    {tab.countKey && tabCounts.hasOwnProperty(tab.countKey)
                      ? `${tab.label} (${tabCounts[tab.countKey]})`
                      : tab.label}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' /* 한 줄 차지 */ }}>
                  {tab.description}
                </Typography>
              </Box>
            }
            sx={{
              minHeight: 72, // 최소 높이
              textTransform: 'none', // 대문자 변환 없음
             // fontSize: '1rem', // label 내부 Typography에서 제어하므로 제거 가능
              fontWeight: 500,
              color: activeTab === index ? tab.color : 'text.primary', // 활성/비활성 색상
              opacity: 1, // 비활성 탭 흐리게 하지 않음 (선택 사항)
              '&:hover': {
                color: tab.hoverColor,
                bgcolor: 'action.hover' // 호버 배경색
              },
              // 선택된 탭 스타일
              '&.Mui-selected': {
                color: tab.color,
                fontWeight: 600, // 선택 시 약간 굵게 (선택 사항)
              },
              // 포커스 스타일 (선택 사항)
              '&.Mui-focusVisible': {
                backgroundColor: 'action.focus'
              }
            }}
            // 접근성 속성
            id={`tab-${index}`}
            aria-controls={`tabpanel-${index}`}
          />
        ))}
      </Tabs>

      {/* 탭 컨텐츠 영역 */}
      {/* flex: 1을 주어 탭 헤더를 제외한 나머지 공간을 채우고, 내용이 넘칠 경우 스크롤 */}
      <Box sx={{ flex: 1, overflow: 'hidden', bgcolor: 'background.default' /* 컨텐츠 영역 배경색 */ }}>
          {tabItemsConfig.map((tab, index) => {
              // 탭별로 필요한 props 구성
              const commonProps = {
                  cve: cveData,
                  currentUser: currentUser,
                  parentSendMessage: parentSendMessage,
              };
              const tabSpecificProps = {
                 ...(tab.component === GenericDataTab && {
                    refreshTrigger: refreshTriggers?.[tab.countKey] || 0,
                    tabConfig: tab.config,
                    onCountChange: handleTabSpecificCountChange(tab.countKey),
                 }),
                 ...(tab.component === CommentsTab && {
                    refreshTrigger: refreshTriggers?.comments || 0,
                    onCountChange: handleTabSpecificCountChange('comments'),
                    highlightCommentId: highlightCommentId,
                 }),
                 ...(tab.component === HistoryTab && {
                    modificationHistory: cveData?.modificationHistory || [],
                 }),
              };

              return (
                <TabPanelWrapper key={tab.label} active={activeTab === index} index={index}>
                  {/* 각 탭에 맞는 컴포넌트 렌더링 */}
                  {React.createElement(tab.component, { ...commonProps, ...tabSpecificProps })}
                </TabPanelWrapper>
              );
          })}
      </Box>
    </Box>
  );
});

CVEDetailTabs.propTypes = {
  cveData: PropTypes.object.isRequired,
  currentUser: PropTypes.object,
  refreshTriggers: PropTypes.object, // 각 탭의 refresh 트리거 포함 객체
  tabCounts: PropTypes.shape({
    poc: PropTypes.number,
    snortRules: PropTypes.number,
    references: PropTypes.number,
    comments: PropTypes.number,
  }).isRequired,
  onCountChange: PropTypes.func.isRequired, // 부모에게 (tabKey, count) 알림
  parentSendMessage: PropTypes.func,
  highlightCommentId: PropTypes.string,
};

export default CVEDetailTabs;