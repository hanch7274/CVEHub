import React, { useState, useMemo, ChangeEvent } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Stack,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Reply as ReplyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon
} from '@mui/icons-material';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { StyledListItem } from './CommonStyles';
import MentionInput from './MentionInput';
import { highlightMentions } from 'shared/utils/mentionUtils';
import { CommentProps } from '../types/cve';

/**
 * 댓글 컴포넌트
 */
const Comment: React.FC<CommentProps> = React.memo(({
  comment,
  depth = 0,
  currentUsername,
  isAdmin,
  isEditing,
  onEdit,
  onDelete,
  onReplySubmit,
  onReply,        // 부모에서 관리하는 답글 모드 시작 핸들러
  onReplyCancel,  // 부모에서 관리하는 답글 모드 종료 핸들러
  replyMode,      // 부모에서 전달받은 현재 답글 모드 여부
  children,
  onStartEdit,
  onFinishEdit,
}) => {
  // 수정 모드에서의 로컬 입력 상태
  const [editContent, setEditContent] = useState<string>(comment.content);
  // 답글 입력 상태
  const [replyContent, setReplyContent] = useState<string>('');
  // 삭제 확인 다이얼로그 상태
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  // 삭제된 댓글 원본 보기 토글
  const [showOriginal, setShowOriginal] = useState<boolean>(false);

  const isDeleted = comment.isDeleted;
  const isAuthor = currentUsername === comment.createdBy;
  const canModify = isAdmin || isAuthor;

  // 날짜 포맷 함수를 useMemo로 최적화
  const formattedDate = useMemo(() => {
    if (!comment.createdAt) return '';
    try {
      const date = typeof comment.createdAt === 'string' 
        ? parseISO(comment.createdAt) 
        : comment.createdAt;
      return formatDistanceToNow(date, { addSuffix: true, locale: ko });
    } catch {
      return typeof comment.createdAt === 'string' 
        ? comment.createdAt 
        : comment.createdAt.toString();
    }
  }, [comment.createdAt]);

  // 수정 모드 토글
  const handleEditToggle = (): void => {
    if (isEditing) {
      console.log('=== Comment Edit Debug ===');
      console.log('Saving edited comment:', {
        commentId: comment.id,
        content: editContent,
        currentUser: currentUsername
      });

      onEdit?.(comment.id || '', editContent)
        .then(response => {
          console.log('Edit success:', response);
          onFinishEdit?.();
        })
        .catch(error => {
          console.error('Edit error:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
          });
        });
    } else {
      setEditContent(comment.content);
      onStartEdit?.(comment.id || '');
    }
  };

  const handleCancelEdit = (): void => {
    onFinishEdit?.();
  };

  // 삭제 다이얼로그
  const handleDeleteClick = (): void => {
    console.log('=== Comment Delete Debug ===');
    console.log('Opening delete dialog:', {
      commentId: comment.id,
      currentUser: currentUsername,
      isAdmin
    });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = (permanent: boolean = false): void => {
    console.log('Confirming delete:', {
      commentId: comment.id,
      permanent,
      currentUser: currentUsername
    });

    onDelete?.(comment.id || '', permanent)
      .then(response => {
        console.log('Delete success:', response);
        setDeleteDialogOpen(false);
      })
      .catch(error => {
        console.error('Delete error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
      });
  };

  // 답글 아이콘 클릭
  const handleReplyIconClick = (): void => {
    if (replyMode) {
      // 이미 답글 모드 -> 취소
      onReplyCancel?.();
      setReplyContent('');
    } else {
      // 답글 모드 시작
      onReply?.(comment);
    }
  };

  // 답글 제출
  const handleReplySubmitLocal = (): void => {
    if (!replyContent.trim()) return;
    
    console.log('=== Comment Reply Debug ===');
    console.log('Submitting reply:', {
      parentId: comment.id,
      content: replyContent,
      currentUser: currentUsername
    });

    onReplySubmit?.(comment.id || '', replyContent)
      .then(response => {
        console.log('Reply submission success:', response);
        onReplyCancel?.();
        setReplyContent('');
      })
      .catch(error => {
        console.error('Reply submission error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
      });
  };

  // 댓글 내용 렌더링
  const renderContent = (): React.ReactNode => {
    // 수정 모드
    if (isEditing) {
      return (
        <Box sx={{ mt: 1 }}>
          <MentionInput
            value={editContent}
            onChange={(value: string) => setEditContent(value)}
            placeholder="댓글을 수정하세요..."
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={handleCancelEdit}>
              취소
            </Button>
            <Button 
              size="small" 
              variant="contained"
              onClick={handleEditToggle}
              disabled={!editContent.trim()}
            >
              수정 완료
            </Button>
          </Stack>
        </Box>
      );
    }

    // 삭제된 댓글 처리
    if (isDeleted && !showOriginal) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          삭제된 댓글입니다.
        </Typography>
      );
    }

    // 일반 댓글
    return (
      <Typography
        variant="body2"
        component="div"
        dangerouslySetInnerHTML={{
          __html: highlightMentions(comment.content),
        }}
        sx={{
          wordBreak: 'break-word',
          '& .mention': {
            color: 'primary.main',
            fontWeight: 'medium',
            '&:hover': {
              textDecoration: 'underline',
              cursor: 'pointer',
            },
          },
        }}
      />
    );
  };

  return (
    <StyledListItem
      elevation={1}
      sx={{
        ml: depth * 3,  // 들여쓰기 간격
        border: '1px solid',
        borderColor: 'divider',
        borderLeft: depth > 0 ? `2px solid rgba(25, 118, 210, 0.12)` : '1px solid rgba(0, 0, 0, 0.12)',  // primary 컬러의 연한 버전
        position: 'relative',
        '&::before': depth > 0 ? {
          content: '""',
          position: 'absolute',
          left: -16,
          top: 0,
          bottom: 0,
          width: 16,
          borderLeft: '1px solid',
          borderColor: 'divider',
          opacity: 0.5
        } : {}
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          {/* 작성자 + 시간 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="subtitle2">{comment.createdBy}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formattedDate}
            </Typography>
          </Box>

          {/* 댓글 본문 */}
          {renderContent()}
        </Box>

        {/* 우측 아이콘들 */}
        <Box>
          {!isDeleted && (
            <Stack direction="row" spacing={1}>
              {canModify && (
                <>
                  {/* 수정 아이콘 */}
                  <IconButton size="small" onClick={handleEditToggle}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  {/* 삭제 아이콘 */}
                  <IconButton size="small" onClick={handleDeleteClick} color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </>
              )}
              {/* 답글 아이콘 */}
              <IconButton size="small" onClick={handleReplyIconClick}>
                <ReplyIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
          {isDeleted && isAdmin && (
            <Stack direction="row" spacing={1}>
              <Tooltip title="영구 삭제">
                <IconButton size="small" onClick={handleDeleteClick} color="error">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={showOriginal ? '삭제된 댓글 숨기기' : '삭제된 댓글 보기'}>
                <IconButton size="small" onClick={() => setShowOriginal(!showOriginal)}>
                  {showOriginal ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Box>
      </Box>

      {/* 답글 작성 영역 */}
      {replyMode && !isDeleted && (
        <Box sx={{ mt: 2 }}>
          <MentionInput
            value={replyContent}
            onChange={(value: string) => setReplyContent(value)}
            placeholder="답글을 입력하세요..."
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={() => {
                onReplyCancel?.();
                setReplyContent('');
              }}
            >
              취소
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleReplySubmitLocal}
              disabled={!replyContent.trim()}
            >
              답글 달기
            </Button>
          </Stack>
        </Box>
      )}

      {/* 삭제 다이얼로그 */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>댓글 삭제</DialogTitle>
        <DialogContent>
          {isAdmin ? (
            <>
              <Typography>관리자 권한으로 삭제 방식을 선택할 수 있습니다.</Typography>
              <Typography color="error" sx={{ mt: 1 }}>
                * 영구 삭제된 댓글은 복구할 수 없습니다.
              </Typography>
            </>
          ) : (
            <Typography>이 댓글을 삭제하시겠습니까?</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>취소</Button>
          {isAdmin ? (
            <>
              <Button onClick={() => handleDeleteConfirm(false)} color="warning">
                일반 삭제
              </Button>
              <Button onClick={() => handleDeleteConfirm(true)} color="error">
                영구 삭제
              </Button>
            </>
          ) : (
            <Button onClick={() => handleDeleteConfirm(false)} color="error">
              삭제
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* 자식(대댓글) */}
      {children}
    </StyledListItem>
  );
}, (prevProps, nextProps) => {
  // 최적화된 비교 로직
  return prevProps.comment.id === nextProps.comment.id &&
         prevProps.comment.content === nextProps.comment.content &&
         prevProps.comment.lastModifiedAt === nextProps.comment.lastModifiedAt &&
         prevProps.comment.isDeleted === nextProps.comment.isDeleted &&
         prevProps.isEditing === nextProps.isEditing &&
         prevProps.replyMode === nextProps.replyMode;
});

// displayName 설정 (디버깅 용이성 향상)
Comment.displayName = 'Comment';

export default Comment;