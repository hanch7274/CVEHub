import React, { useState, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Grid,
  Typography,
  Box,
  Paper,
  IconButton,
} from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import InlineEditText from './components/InlineEditText'; // 컴포넌트 경로 가정

// 상수 및 유틸리티 함수 (원래 CVEDetail에 있던 것들)
// 별도 파일(constants/cveConstants.js, utils/cveUtils.js)로 분리하는 것을 강력히 권장합니다.
const STATUS_OPTIONS = {
  '신규등록': { label: '신규등록', description: '새로 등록된 CVE' },
  '분석중': { label: '분석중', description: '보안 전문가가 분석 진행중' },
  '릴리즈 완료': { label: '릴리즈 완료', description: '분석이 완료되어 릴리즈됨' },
  '분석불가': { label: '분석불가', description: '분석이 불가능한 상태' }
};

const getStatusColor = (status) => {
  switch (status) {
    case '분석중':      return '#2196f3';
    case '신규등록':    return '#ff9800';
    case '릴리즈 완료': return '#4caf50';
    case '분석불가':    return '#f44336';
    default:           return '#757575';
  }
};

const statusCardStyle = {
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

const SEVERITY_OPTIONS = [
  { value: 'Critical', label: 'Critical', color: '#d32f2f' },
  { value: 'High', label: 'High', color: '#f44336' },
  { value: 'Medium', label: 'Medium', color: '#ff9800' },
  { value: 'Low', label: 'Low', color: '#4caf50' }
];

// Severity 색상 가져오기 (대소문자 구분 없이 비교 추가)
const getSeverityColor = (severity) => {
    // severity가 null이나 undefined일 경우 빈 문자열로 처리
    const lowerCaseSeverity = (severity || '').toLowerCase();
    const option = SEVERITY_OPTIONS.find(opt => opt.value.toLowerCase() === lowerCaseSeverity);
    return option ? option.color : '#757575'; // 기본 색상
};
// --- 상수 및 유틸리티 끝 ---


const CVEDetailInfoPanel = memo(({ cveData, onUpdateField, canEdit }) => {
  const [detailExpanded, setDetailExpanded] = useState(false);

  const handleTitleSave = useCallback((newTitle) => {
    if (newTitle !== cveData.title) { // 변경된 경우에만 호출
        onUpdateField('title', newTitle);
    }
  }, [onUpdateField, cveData.title]);

  const handleDescriptionSave = useCallback((newDescription) => {
     if (newDescription !== cveData.description) { // 변경된 경우에만 호출
        onUpdateField('description', newDescription);
     }
  }, [onUpdateField, cveData.description]);

  const handleStatusClick = useCallback((newStatus) => {
    if (canEdit && newStatus !== cveData.status) { // 편집 가능하고 값이 변경된 경우
        onUpdateField('status', newStatus);
    }
  }, [onUpdateField, canEdit, cveData.status]);

  const handleSeverityClick = useCallback((newSeverity) => {
     if (canEdit && newSeverity !== cveData.severity) { // 편집 가능하고 값이 변경된 경우
        onUpdateField('severity', newSeverity);
     }
  }, [onUpdateField, canEdit, cveData.severity]);

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
              value={cveData.title || ''}
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
                maxHeight: detailExpanded ? '400px' : '60px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <InlineEditText
                value={cveData.description || ''}
                onSave={handleDescriptionSave}
                placeholder="설명을 입력하세요..."
                multiline
                disabled={!canEdit}
                fontSize="0.9rem"
                externalEdit={detailExpanded} // 외부에서 편집 상태 제어 (optional)
                onEditingStart={() => setDetailExpanded(true)} // 편집 시작 시 확장
                onEditingEnd={() => setTimeout(() => setDetailExpanded(false), 100)} // 편집 종료 시 축소 (딜레이 추가)
              />
            </Paper>
            {/* 확장/축소 버튼 */}
            <Box sx={{ position: 'absolute', bottom: 4, right: 4 }}>
              <IconButton size="small" onClick={() => setDetailExpanded((prev) => !prev)}>
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
             const isSelected = value === cveData.status;
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

CVEDetailInfoPanel.propTypes = {
  cveData: PropTypes.shape({
    title: PropTypes.string,
    description: PropTypes.string,
    status: PropTypes.string,
    severity: PropTypes.string,
  }).isRequired,
  onUpdateField: PropTypes.func.isRequired,
  canEdit: PropTypes.bool.isRequired, // canEdit은 boolean이어야 함
};

export default CVEDetailInfoPanel;