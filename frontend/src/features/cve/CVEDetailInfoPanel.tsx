import React, { useState, useCallback, memo } from 'react';
import {
  Grid,
  Typography,
  Box,
  Paper,
  IconButton,
  SxProps,
  Theme,
} from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import InlineEditText from './components/InlineEditText';

// 타입 정의
interface StatusOption {
  label: string;
  description: string;
}

interface SeverityOption {
  value: string;
  label: string;
  color: string;
}

interface CVEData {
  title?: string;
  description?: string;
  status?: string;
  severity?: string;
  [key: string]: any; // 기타 필드를 위한 인덱스 시그니처
}

interface CVEDetailInfoPanelProps {
  cveData: CVEData;
  onUpdateField: (field: string, value: string) => void;
  canEdit: boolean;
}

// 상수 및 유틸리티 함수 (원래 CVEDetail에 있던 것들)
// 별도 파일(constants/cveConstants.ts, utils/cveUtils.ts)로 분리하는 것을 강력히 권장합니다.
const STATUS_OPTIONS: Record<string, StatusOption> = {
  '신규등록': { label: '신규등록', description: '새로 등록된 CVE' },
  '분석중': { label: '분석중', description: '보안 전문가가 분석 진행중' },
  '릴리즈 완료': { label: '릴리즈 완료', description: '분석이 완료되어 릴리즈됨' },
  '분석불가': { label: '분석불가', description: '분석이 불가능한 상태' }
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case '분석중':      return '#2196f3';
    case '신규등록':    return '#ff9800';
    case '릴리즈 완료': return '#4caf50';
    case '분석불가':    return '#f44336';
    default:           return '#757575';
  }
};

const statusCardStyle: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: '8px 12px',
  minHeight: '60px',
  border: '1px solid',
  borderRadius: 1,
  cursor: 'pointer',
  transition: 'all 0.2s',
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  }
};

const SEVERITY_OPTIONS: SeverityOption[] = [
  { value: 'Critical', label: 'Critical', color: '#d32f2f' },
  { value: 'High', label: 'High', color: '#f44336' },
  { value: 'Medium', label: 'Medium', color: '#ff9800' },
  { value: 'Low', label: 'Low', color: '#4caf50' }
];

// Severity 색상 가져오기 (대소문자 구분 없이 비교 추가)
const getSeverityColor = (severity: string | undefined): string => {
  // severity가 null이나 undefined일 경우 빈 문자열로 처리
  const lowerCaseSeverity = (severity || '').toLowerCase();
  const option = SEVERITY_OPTIONS.find(opt => opt.value.toLowerCase() === lowerCaseSeverity);
  return option ? option.color : '#757575'; // 기본 색상
};
// --- 상수 및 유틸리티 끝 ---

const CVEDetailInfoPanel: React.FC<CVEDetailInfoPanelProps> = memo(({ cveData, onUpdateField, canEdit }) => {
  const [detailExpanded, setDetailExpanded] = useState<boolean>(false);

  // 이벤트 핸들러에 참조 안정성 보장
  const handleTitleSave = useCallback((newTitle: string): void => {
    // 값이 실제로 변경되었는지 확인 후 업데이트 요청
    if (canEdit && newTitle !== cveData?.title) {
      onUpdateField('title', newTitle);
    }
  }, [canEdit, cveData?.title, onUpdateField]);

  const handleDescriptionSave = useCallback((newDescription: string): void => {
    // 값이 실제로 변경되었는지 확인 후 업데이트 요청
    if (canEdit && newDescription !== cveData?.description) {
      onUpdateField('description', newDescription);
    }
  }, [canEdit, cveData?.description, onUpdateField]);

  const handleStatusClick = useCallback((newStatus: string): void => {
    // 편집 권한이 있고 실제 값이 변경된 경우에만 업데이트
    if (canEdit && newStatus !== cveData?.status) {
      onUpdateField('status', newStatus);
    }
  }, [canEdit, cveData?.status, onUpdateField]);

  const handleSeverityClick = useCallback((newSeverity: string): void => {
    // 편집 권한이 있고 실제 값이 변경된 경우에만 업데이트
    if (canEdit && newSeverity !== cveData?.severity) {
      onUpdateField('severity', newSeverity);
    }
  }, [canEdit, cveData?.severity, onUpdateField]);

  // 설명 필드 확장/축소 토글 핸들러
  const toggleDetailExpanded = useCallback(() => {
    setDetailExpanded(prev => !prev);
  }, []);

  // 설명 필드 편집 종료 시 축소 핸들러
  const handleDescriptionEditEnd = useCallback(() => {
    // 편집이 끝난 후 약간의 딜레이 후에 축소 (UX 개선)
    setTimeout(() => setDetailExpanded(false), 100);
  }, []);

  return (
    <Grid container spacing={2}>
      {/* 좌측: Title, Description */}
      <Grid item xs={12} md={7}>
        {/* Title */}
        <Box mb={2}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Title
          </Typography>
          <Paper variant="outlined" sx={{ p: 1, borderRadius: 1, mb: 2 }}>
            <InlineEditText
              value={cveData?.title || ''}
              onSave={handleTitleSave}
              placeholder="제목을 입력하세요"
              disabled={!canEdit}
              fontSize="0.9rem"
            />
          </Paper>
        </Box>

        {/* Description */}
        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Description
          </Typography>
          <Box sx={{ position: 'relative' }}>
            <Paper
              className="description-container"
              variant="outlined"
              sx={{
                p: 1,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                transition: 'max-height 0.3s ease-in-out',
                height: 'auto',
                maxHeight: detailExpanded ? '500px' : '100px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <InlineEditText
                value={cveData?.description || ''}
                multiline
                maxHeight={detailExpanded ? '500px' : '100px'}
                onSave={handleDescriptionSave}
                placeholder="설명을 입력하세요..."
                disabled={!canEdit}
                fontSize="0.85rem"
                onEditingStart={() => setDetailExpanded(true)}
                onEditingEnd={handleDescriptionEditEnd}
              />
            </Paper>
            {/* 확장/축소 버튼 */}
            <Box sx={{ position: 'absolute', bottom: 4, right: 4 }}>
              <IconButton size="small" onClick={toggleDetailExpanded}>
                {detailExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
          </Box>
        </Box>
      </Grid>

      {/* 우측: Status, Severity */}
      <Grid item xs={12} md={5}>
        {/* Status */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Status
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 1.5,
            height: '150px' // 고정 높이 유지
          }}
        >
          {Object.entries(STATUS_OPTIONS).map(([value, { label, description }]) => {
            const isSelected = value === cveData?.status;
            const currentStatusColor = getStatusColor(value);
            return (
              <Paper
                key={value}
                elevation={0}
                sx={{
                  ...statusCardStyle, // 기본 스타일 적용
                  bgcolor: isSelected ? 'action.selected' : 'background.paper',
                  borderColor: isSelected ? currentStatusColor : 'divider',
                  cursor: canEdit ? 'pointer' : 'default', // 편집 가능할 때만 커서 변경
                  // 호버 스타일은 canEdit일 때만 적용
                  ...(canEdit && {
                    '&:hover': {
                      backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }
                  }),
                }}
                onClick={() => handleStatusClick(value)}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%' }}>
                  <CircleIcon sx={{ fontSize: 8, color: currentStatusColor, flexShrink: 0, mt: 0.7 }} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? currentStatusColor : 'text.primary', lineHeight: 1.2 }}>
                      {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {description}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>

        {/* Severity */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Severity
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
            {SEVERITY_OPTIONS.map((option) => {
              const backendSeverity = (cveData?.severity || '').toLowerCase();
              const optionValue = option.value.toLowerCase();
              const isSelected = optionValue === backendSeverity;
              const currentSeverityColor = getSeverityColor(option.value); // 옵션 값 기준으로 색상 가져오기

              return (
                <Paper
                  key={option.value}
                  elevation={0}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center', // 중앙 정렬
                    minHeight: '40px',
                    border: '1px solid',
                    borderRadius: 1,
                    p: 1, // 패딩
                    textAlign: 'center',
                    cursor: canEdit ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    bgcolor: isSelected ? 'action.selected' : 'background.paper',
                    borderColor: isSelected ? currentSeverityColor : 'divider',
                    // 호버 스타일
                    ...(canEdit && {
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        borderColor: currentSeverityColor, // 호버 시 해당 색상으로 테두리 변경
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }
                    }),
                  }}
                  onClick={() => handleSeverityClick(option.value)}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}> {/* 아이콘과 텍스트 간격 조정 */}
                    <CircleIcon sx={{ fontSize: 8, color: currentSeverityColor, flexShrink: 0 }} />
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? currentSeverityColor : 'text.primary'
                      }}
                    >
                      {option.label}
                    </Typography>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
});

// displayName 설정 (React DevTools에서 디버깅 시 유용)
CVEDetailInfoPanel.displayName = 'CVEDetailInfoPanel';

export default CVEDetailInfoPanel;