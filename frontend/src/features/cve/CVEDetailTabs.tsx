// CVEDetailTabs.tsx

import React, { useState, useCallback, memo, ReactNode, ElementType, useMemo } from 'react';
// PropTypes는 더 이상 필요 없으므로 제거
// import PropTypes from 'prop-types';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import { SvgIconComponent } from '@mui/icons-material'; // MUI 아이콘 타입
import ScienceIcon from '@mui/icons-material/Science';
import ShieldIcon from '@mui/icons-material/Shield';
import LinkIcon from '@mui/icons-material/Link';
import CommentIcon from '@mui/icons-material/Comment';
import HistoryIcon from '@mui/icons-material/History';

// 필요한 컴포넌트 import
import GenericDataTab from './components/GenericDataTab';
import CommentsTab from './components/CommentsTab';
import HistoryTab from './components/HistoryTab';

// CVE 관련 타입 import
import { CVEDetailData, TabCounts, RefreshTriggers, CVEDetailTabsProps } from './types/cve';
import {
  pocTabConfig, // 실제 타입 정의 필요 (e.g., PocTabConfigType)
  snortRuleTabConfig, // 실제 타입 정의 필요
  referenceTabConfig // 실제 타입 정의 필요
} from './components/tabConfigs';

// 타입 정의는 types/cve.ts로 이동

// TabPanelWrapper의 Props 타입
interface TabPanelWrapperProps {
  children: ReactNode;
  active: boolean;
  index: number;
  // Box 컴포넌트에 전달될 수 있는 다른 속성들 허용
  [key: string]: any; 
}

// 탭 키 타입 (TabCounts의 키)
type TabKey = keyof TabCounts;

// 탭 구성 항목 타입
interface TabItemConfig {
  label: string;
  iconComponent: SvgIconComponent | ElementType;
  color: string;
  hoverColor: string;
  description: string;
  countKey: TabKey | null;
  component: React.ComponentType<any>;
  config: object | null;
};


// --- 상수 정의 ---

// tabItemsConfig 타입 명시
const tabItemsConfig: TabItemConfig[] = [
  { label: 'PoC', iconComponent: ScienceIcon, color: '#2196f3', hoverColor: '#1976d2', description: '증명 코드 및 취약점 검증', countKey: 'poc', component: GenericDataTab, config: pocTabConfig },
  { label: 'Snort Rule', iconComponent: ShieldIcon, color: '#4caf50', hoverColor: '#388e3c', description: '탐지 규칙 및 방어 정책', countKey: 'snortRule', component: GenericDataTab, config: snortRuleTabConfig },
  { label: 'Reference', iconComponent: LinkIcon, color: '#ff9800', hoverColor: '#f57c00', description: '관련 문서 및 참고 자료', countKey: 'reference', component: GenericDataTab, config: referenceTabConfig },
  { label: 'Comments', iconComponent: CommentIcon, color: '#9c27b0', hoverColor: '#7b1fa2', description: '토론 및 의견 공유', countKey: 'comments', component: CommentsTab, config: null },
  { label: 'History', iconComponent: HistoryIcon, color: '#757575', hoverColor: '#757575', description: '수정 이력', countKey: null, component: HistoryTab, config: null }
];

// --- 컴포넌트 구현 ---

// 탭 패널 Wrapper 컴포넌트
const TabPanelWrapper = memo(({ children, active, index, ...other }: TabPanelWrapperProps) => (
  <Box
    sx={{
      display: active ? 'block' : 'none',
      height: '100%',
      p: 3,
      overflowY: 'auto',
      '&::-webkit-scrollbar': { width: '8px', backgroundColor: 'transparent' },
      '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(0, 0, 0, 0.1)', borderRadius: '4px', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.2)' } }
    }}
    role="tabpanel"
    hidden={!active} // active가 false일 때 숨김
    id={`tabpanel-${index}`}
    aria-labelledby={`tab-${index}`}
    {...other} // 다른 props 전달 (예: sx)
  >
    {/* active일 때만 children을 렌더링하도록 최적화 */}
    {active && children}
  </Box>
));
TabPanelWrapper.displayName = 'TabPanelWrapper'; // DevTools 이름 설정

// 메인 탭 컴포넌트
const CVEDetailTabs = memo((props: CVEDetailTabsProps) => {
  const {
    cveData,
    currentUser,
    refreshTriggers,
    tabCounts,
    onCountChange,
    parentSendMessage,
    highlightCommentId,
  } = props;

  const [activeTab, setActiveTab] = useState<number>(0);

  // 탭 변경 핸들러 - 의존성 배열 최적화
  const handleTabChange = useCallback((_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  }, []);

  // 탭 카운트 변경 핸들러 - 구체적인 탭에 대한 변경을 처리하도록 최적화
  const handleTabSpecificCountChange = useCallback((tabKey: TabKey) => {
    return (count: number) => {
      // 상위 컴포넌트에 전달된 콜백에 변경사항 통보
      if (onCountChange) {
        onCountChange(tabKey, count);
      }
    };
  }, [onCountChange]);

  // cveData를 cve라는 이름으로 내부 컴포넌트에 전달하므로, 일관성을 위해 변수 준비
  const commonProps = useMemo(() => ({
    cve: cveData,
    currentUser: currentUser ?? undefined,
    parentSendMessage,
  }), [cveData, currentUser, parentSendMessage]);

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.paper' }}>
      {/* 탭 헤더 */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="fullWidth"
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
        aria-label="CVE Detail Tabs"
      >
        {tabItemsConfig.map((tab, index) => {
          // countKey가 null이 아니고, tabCounts에 해당 키가 있는지 확인
          const count = tab.countKey && tabCounts.hasOwnProperty(tab.countKey) ? tabCounts[tab.countKey] : undefined;
          const labelText = count !== undefined ? `${tab.label} (${count})` : tab.label;

          return (
            <Tab
              key={tab.label}
              label={
                <Box sx={{ textAlign: 'center', py: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
                    {/* 아이콘 컴포넌트 생성 */}
                    {React.createElement(tab.iconComponent, { sx: { fontSize: 20 } })}
                    <Typography component="span" sx={{ fontSize: '0.9rem' }}>
                      {labelText}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {tab.description}
                  </Typography>
                </Box>
              }
              sx={{
                minHeight: 72,
                textTransform: 'none',
                fontWeight: 500,
                color: activeTab === index ? tab.color : 'text.primary',
                opacity: 1,
                '&:hover': {
                  color: tab.hoverColor,
                  bgcolor: 'action.hover'
                },
                '&.Mui-selected': {
                  color: tab.color,
                  fontWeight: 600,
                },
                '&.Mui-focusVisible': {
                  backgroundColor: 'action.focus'
                }
              }}
              id={`tab-${index}`}
              aria-controls={`tabpanel-${index}`}
            />
          );
        })}
      </Tabs>

      {/* 탭 컨텐츠 영역 */}
      <Box sx={{ flex: 1, overflow: 'hidden', bgcolor: 'background.paper' }}>
        {tabItemsConfig.map((tab, index) => {
          // 각 탭 컴포넌트에 전달될 공통 Props
          // currentUser가 null일 수 있으므로 명시적 처리
          let tabSpecificProps: Record<string, any> = {};

          if (tab.component === GenericDataTab && tab.countKey) {
            tabSpecificProps = {
              // refreshTriggers가 undefined일 수 있으므로 optional chaining 및 기본값 0 사용
              refreshTrigger: refreshTriggers?.[tab.countKey] ?? 0,
              // 탭에 해당하는 설정 객체 전달
              tabConfig: tab.config,
              onCountChange: handleTabSpecificCountChange(tab.countKey),
            };
          } else if (tab.component === CommentsTab) {
            tabSpecificProps = {
              refreshTrigger: refreshTriggers?.comments ?? 0,
              onCountChange: handleTabSpecificCountChange('comments'),
              // highlightCommentId가 null일 수 있으므로 ?? undefined 사용
              highlightCommentId: highlightCommentId ?? undefined,
            };
          } else if (tab.component === HistoryTab) {
            tabSpecificProps = {
              // cveData.modificationHistory가 없을 수 있으므로 빈 배열([]) 전달
              modificationHistory: cveData?.modificationHistory || [],
            };
          }

          // 최종 Props 객체 결합
          const finalProps = { ...commonProps, ...tabSpecificProps };

          return (
            <TabPanelWrapper key={tab.label} active={activeTab === index} index={index}>
              {/* React.createElement 사용 시 타입 주의 */}
              {React.createElement(tab.component, finalProps)}
            </TabPanelWrapper>
          );
        })}
      </Box>
    </Box>
  );
});

CVEDetailTabs.displayName = 'CVEDetailTabs'; // DevTools 이름 설정

// PropTypes는 제거

export default CVEDetailTabs;