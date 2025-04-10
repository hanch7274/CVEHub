import React, { useState } from 'react';
import { TIME_ZONES, DATE_FORMATS, formatDateTime } from '../../../shared/utils/dateUtils';
import { 
  Box, 
  Typography, 
  Paper, 
  Chip, 
  Divider, 
  Collapse,
  Link,
  Card,
  CardContent,
  Avatar,
  Tooltip,
  IconButton,
  useTheme,
  useMediaQuery
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CreateIcon from '@mui/icons-material/Create';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CommentIcon from '@mui/icons-material/Comment';
import PermIdentityIcon from '@mui/icons-material/PermIdentity';
import { Link as RouterLink } from 'react-router-dom';

// 활동 동작에 따른 아이콘 및 색상 매핑
const actionIcons = {
  create: <CreateIcon fontSize="small" />,
  update: <EditIcon fontSize="small" />,
  delete: <DeleteIcon fontSize="small" />,
  add: <AddIcon fontSize="small" />,
  assign: <AssignmentIcon fontSize="small" />,
  comment: <CommentIcon fontSize="small" />,
  comment_update: <EditIcon fontSize="small" />,
  comment_delete: <DeleteIcon fontSize="small" />
};

const actionColors = {
  create: 'success',
  update: 'primary',
  delete: 'error',
  add: 'success',
  assign: 'info',
  comment: 'secondary',
  comment_update: 'secondary',
  comment_delete: 'error'
};

// 활동 대상 유형에 따른 라우팅 경로 매핑
const getTargetRoute = (targetType, targetId) => {
  switch (targetType) {
    case 'cve':
      return `/cves/${targetId}`;
    case 'poc':
      return `/cves/${targetId.split('-poc-')[0]}/poc/${targetId}`;
    case 'snort_rule':
      return `/cves/${targetId.split('-snort-')[0]}/snort-rule/${targetId}`;
    case 'comment':
      // 댓글 ID에서 부모 리소스 ID를 추출 (가정)
      const parentId = targetId.split('-comment-')[0];
      return `/cves/${parentId}#comment-${targetId}`;
    default:
      return '#';
  }
};

// 활동 동작에 따른 표시 텍스트 매핑
const getActionText = (action) => {
  switch (action) {
    case 'create': return '생성';
    case 'update': return '수정';
    case 'delete': return '삭제';
    case 'add': return '추가';
    case 'assign': return '할당';
    case 'comment': return '댓글 작성';
    case 'comment_update': return '댓글 수정';
    case 'comment_delete': return '댓글 삭제';
    default: return action;
  }
};

// 대상 유형에 따른 표시 텍스트 매핑
const getTargetTypeText = (targetType) => {
  switch (targetType) {
    case 'cve': return 'CVE';
    case 'poc': return 'PoC';
    case 'snort_rule': return 'Snort 규칙';
    case 'comment': return '댓글';
    case 'reference': return '참조문서';
    case 'user': return '사용자';
    case 'system': return '시스템';
    default: return targetType;
  }
};

/**
 * 개선된 개별 활동 항목 컴포넌트
 * - 디자인 개선
 * - 변경 사항 프리뷰 개선
 * - 인터랙션 개선
 * 
 * @param {Object} props 컴포넌트 속성
 * @param {Object} props.activity 활동 데이터
 * @returns {JSX.Element} 렌더링된 컴포넌트
 */
const ActivityItem = ({ activity }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  // PC 환경에 최적화
  
  const {
    username,
    timestamp,
    action,
    targetType,
    targetId,
    targetTitle,
    changes
  } = activity;

  // UTC 시간을 KST로 변환하여 표시
  const dateTimeDisplay = formatDateTime(timestamp, DATE_FORMATS.DISPLAY.FULL, TIME_ZONES.KST);
  
  // 툴팁용 상세 한글 포맷 - 이미 KST로 변환된 날짜 사용
  const dateTimeDetail = formatDateTime(timestamp, 'yyyy년 MM월 dd일 HH시 mm분 ss초');
  
  // 변경 사항이 있는지 확인
  const hasChanges = changes && changes.length > 0;
  
  // 색상 계산 - 투명도를 포함한 색상으로 변환
  const getBorderColor = () => {
    const color = actionColors[action] || 'grey';
    return theme.palette[color].main;
  };
  
  // 액션 배경색 계산
  const getActionBgColor = () => {
    const color = actionColors[action] || 'grey';
    return theme.palette[color].light;
  };

  // 추가 정보 요약 생성 함수 (PoC, Reference 등)
  const getAdditionalInfo = () => {
    if (!changes || changes.length === 0) return '';
    
    const additionalData = [];
    
    // PoC 정보 찾기
    const pocChange = changes.find(c => c.field === 'poc' && c.action === 'add');
    if (pocChange && pocChange.items && pocChange.items.length > 0) {
      additionalData.push(`PoC ${pocChange.items.length}개`);
    }
    
    // 참조문서 정보 찾기
    const refChange = changes.find(c => c.field === 'reference' && c.action === 'add');
    if (refChange && refChange.items && refChange.items.length > 0) {
      additionalData.push(`참조문서 ${refChange.items.length}개`);
    }
    
    // Snort 규칙 정보 찾기
    const ruleChange = changes.find(c => c.field === 'snort_rule' && c.action === 'add');
    if (ruleChange && ruleChange.items && ruleChange.items.length > 0) {
      additionalData.push(`Snort 규칙 ${ruleChange.items.length}개`);
    }
    
    // 추가 정보가 있는 경우 문자열로 결합하여 반환
    if (additionalData.length > 0) {
      return ` (${additionalData.join(', ')} 포함)`;
    }
    
    // 추가 정보가 없는 경우 빈 문자열 반환
    return '';
  };

  // 요약 텍스트 생성
  const summaryText = () => {
    // 타입이 CVE인지 확인
    const isCveActivity = targetType === 'cve';
    
    // 표시할 ID 결정
    let displayId = isCveActivity ? targetId : (targetTitle || targetId);
    
    // ID가 없는 경우 처리
    if (!displayId) {
      displayId = targetId || '';
    }
    
    return (
      <>
        <Typography 
          component="span" 
          variant="body2" 
          fontWeight="medium"
          color="text.primary"
        >
          {username}
        </Typography>
        님이 {' '}
        <Link
          component={RouterLink}
          to={getTargetRoute(targetType, targetId)}
          sx={{ fontWeight: 'medium' }}
          underline="hover"
        >
          {displayId}
        </Link>
        {/* CVE가 아닌 타입에만 괄호로 타입 표시 */}
        {!isCveActivity ? ` (${getTargetTypeText(targetType)})` : ''}
        {action && ` ${getActionText(action)}`}함{getAdditionalInfo()}
      </>
    );
  };

  return (
    <Card 
      elevation={1} 
      sx={{ 
        mb: 2,
        overflow: 'visible',
        position: 'relative',
        border: `1px solid ${theme.palette.divider}`,
        borderLeft: `3px solid ${getBorderColor()}`,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: theme.shadows[3],
        }
      }}
    >
      <CardContent sx={{ pt: 2, pb: 2, '&:last-child': { pb: 2 } }}>
        {/* 액션 아이콘 */}
        <Box 
          sx={{ 
            position: 'absolute',
            top: -12,
            left: 12,
            width: 24,
            height: 24,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: getActionBgColor(),
            color: getBorderColor(),
            border: `1px solid ${getBorderColor()}`,
            zIndex: 1
          }}
        >
          {actionIcons[action] || <CreateIcon fontSize="small" />}
        </Box>

        {/* 헤더 영역 */}
        <Box display="flex" flexDirection="row" 
          justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" ml={4} mb={0}>
            <Avatar
              sx={{ 
                width: 24, 
                height: 24, 
                fontSize: '0.875rem',
                mr: 1,
                bgcolor: theme.palette.primary.main
              }}
            >
              {username ? username.charAt(0).toUpperCase() : <PermIdentityIcon fontSize="small" />}
            </Avatar>
            
            <Typography variant="body2" color="text.primary">
              {summaryText()}
            </Typography>
          </Box>

          <Box display="flex" alignItems="center" ml={0}>
            <Tooltip title={dateTimeDetail}>
              <Typography variant="caption" color="text.secondary">
                {dateTimeDisplay}
              </Typography>
            </Tooltip>
          </Box>
        </Box>

        {/* 변경 사항이 있을 경우 표시 */}
        {hasChanges && (
          <>
            <Box 
              display="flex" 
              alignItems="center" 
              justifyContent="space-between"
              mt={1.5}
              sx={{ 
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
                p: 1,
                mx: -1,
                borderRadius: 1
              }}
              onClick={() => setExpanded(!expanded)}
            >
              <Typography variant="caption" color="text.secondary">
                {changes.length}개의 변경 사항 {action === 'delete' ? '삭제됨' : ''}
              </Typography>
              <IconButton size="small" onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}>
                {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
              </IconButton>
            </Box>

            <Collapse in={expanded} timeout="auto">
              <Divider sx={{ my: 1 }} />
              <Box sx={{ mt: 1 }}>
                {changes.map((change, index) => (
                  <Box key={index} sx={{ mb: 1.5 }}>
                    <Typography variant="caption" fontWeight="bold" gutterBottom>
                      {change.field_name || change.field}:
                    </Typography>
                    
                    {change.action === 'edit' && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', mt: 0.5 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(244, 67, 54, 0.1)', 
                          p: 1, 
                          borderRadius: 1,
                          border: '1px solid rgba(244, 67, 54, 0.2)'
                        }}>
                          <Typography variant="caption">
                            - {String(change.before || '').substring(0, 100)}
                            {String(change.before || '').length > 100 ? '...' : ''}
                          </Typography>
                        </Box>
                        <Box sx={{ 
                          backgroundColor: 'rgba(76, 175, 80, 0.1)', 
                          p: 1, 
                          mt: 0.5, 
                          borderRadius: 1,
                          border: '1px solid rgba(76, 175, 80, 0.2)'
                        }}>
                          <Typography variant="caption">
                            + {String(change.after || '').substring(0, 100)}
                            {String(change.after || '').length > 100 ? '...' : ''}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                    
                    {change.action === 'add' && change.items && change.items.length > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        {change.items.map((item, itemIndex) => (
                          <Box key={itemIndex} sx={{ 
                            backgroundColor: 'rgba(76, 175, 80, 0.1)', 
                            p: 1, 
                            mt: 0.5, 
                            borderRadius: 1,
                            border: '1px solid rgba(76, 175, 80, 0.2)'
                          }}>
                            <Typography variant="caption">
                              + {typeof item === 'object' ? JSON.stringify(item).substring(0, 100) : String(item).substring(0, 100)}
                              {(typeof item === 'object' ? JSON.stringify(item).length : String(item).length) > 100 ? '...' : ''}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                    
                    {change.action === 'delete' && (
                      <Box sx={{ 
                        backgroundColor: 'rgba(244, 67, 54, 0.1)', 
                        p: 1, 
                        mt: 0.5, 
                        borderRadius: 1,
                        border: '1px solid rgba(244, 67, 54, 0.2)'
                      }}>
                        <Typography variant="caption">
                          삭제됨
                        </Typography>
                      </Box>
                    )}
                    
                    {change.summary && (
                      <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                        {change.summary}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default React.memo(ActivityItem);