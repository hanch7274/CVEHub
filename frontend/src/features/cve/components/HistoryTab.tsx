import React from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Tooltip
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent
} from '@mui/lab';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Code as CodeIcon,
  Security as SecurityIcon,
  Link as LinkIcon,
  Title as TitleIcon,
  Description as DescriptionIcon,
  Assignment as AssignmentIcon,
  Note as NoteIcon
} from '@mui/icons-material';
import { formatDateTime, TIME_ZONES } from 'shared/utils/dateUtils';
import { HistoryTabProps, HistoryItem, HistoryChange } from '../types/cve';

// 필드별 아이콘 매핑
const FIELD_ICONS: Record<string, React.ReactElement> = {
  title: <TitleIcon />,
  description: <DescriptionIcon />,
  status: <AssignmentIcon />,
  assigned_to: <PersonIcon />,
  notes: <NoteIcon />,
  snort_rules: <SecurityIcon />,
  pocs: <CodeIcon />,
  references: <LinkIcon />
};

// 액션별 색상 매핑
const ACTION_COLORS: Record<string, 'success' | 'primary' | 'error'> = {
  add: 'success',
  edit: 'primary',
  delete: 'error'
};

// 액션별 한글 텍스트
const ACTION_TEXT: Record<string, string> = {
  add: '추가',
  edit: '수정',
  delete: '삭제'
};

/**
 * 수정 이력 탭 컴포넌트
 * @param props HistoryTabProps
 * @returns React 컴포넌트
 */
const HistoryTab: React.FC<HistoryTabProps> = ({ modificationHistory = [] }) => {

  if (!Array.isArray(modificationHistory) || modificationHistory.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          수정 이력이 없습니다.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Timeline>
        {modificationHistory.map((history: HistoryItem, historyIndex: number) => (
          <TimelineItem key={historyIndex}>
            <TimelineOppositeContent color="text.secondary">
              {formatDateTime(history.modifiedAt || history.lastModifiedAt, undefined, TIME_ZONES.KST)}
            </TimelineOppositeContent>
            <TimelineSeparator>
              <TimelineDot color="primary">
                <PersonIcon />
              </TimelineDot>
              {historyIndex < modificationHistory.length - 1 && <TimelineConnector />}
            </TimelineSeparator>
            <TimelineContent>
              <Paper 
                elevation={0} 
                sx={{ 
                  p: 2, 
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Typography variant="subtitle2" component="span">
                    {history.username}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    님이 변경사항을 {history.changes?.length || 0}건 적용했습니다
                  </Typography>
                </Box>
                <List dense>
                  {history.changes?.map((change: HistoryChange, changeIndex: number) => (
                    <ListItem 
                      key={changeIndex}
                      sx={{
                        borderRadius: 1,
                        '&:hover': {
                          bgcolor: 'action.hover'
                        }
                      }}
                    >
                      <ListItemIcon>
                        <Tooltip title={change.fieldName || change.field}>
                          {FIELD_ICONS[change.field] ? FIELD_ICONS[change.field] : <EditIcon />}
                        </Tooltip>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {change.summary}
                            <Chip
                              label={ACTION_TEXT[change.action] || change.action}
                              size="small"
                              color={ACTION_COLORS[change.action] || 'primary'}
                              sx={{ height: 20 }}
                            />
                          </Box>
                        }
                        secondary={
                          change.detailType === 'detailed' && (
                            <Box component="span" sx={{ display: 'block', mt: 1 }}>
                              {change.before && change.after && (
                                <Box component="span" sx={{ display: 'block' }}>
                                  <Typography component="span" variant="body2" color="text.secondary" display="block">
                                    변경 전: {change.before}
                                  </Typography>
                                  <Typography component="span" variant="body2" color="text.secondary" display="block">
                                    변경 후: {change.after}
                                  </Typography>
                                </Box>
                              )}
                              {change.items && change.items.length > 0 && (
                                <Box component="span" sx={{ display: 'block', mt: 1 }}>
                                  {change.items.map((item, idx) => (
                                    <Paper
                                      key={idx}
                                      variant="outlined"
                                      sx={{ 
                                        p: 1, 
                                        mt: 1,
                                        bgcolor: 'background.paper',
                                        borderRadius: 1
                                      }}
                                    >
                                      <Typography component="span" variant="body2" color="text.secondary">
                                        {item.type && `[${item.type}] `}
                                        {item.rule || item.url || JSON.stringify(item)}
                                      </Typography>
                                    </Paper>
                                  ))}
                                </Box>
                              )}
                            </Box>
                          )
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
    </Box>
  );
};

export default HistoryTab;
