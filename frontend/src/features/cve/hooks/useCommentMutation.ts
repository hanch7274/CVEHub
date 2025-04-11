import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { AxiosError } from 'axios';
import api from 'shared/api/config/axios';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { SOCKET_EVENTS } from 'core/socket/services/constants';
import logger from 'shared/utils/logging';
import { CommentData } from '../types/CommentTypes';

// 타입 정의
export interface CVEDetailData {
  cveId: string;
  comments?: CommentData[];
  [key: string]: any;
}

// API 응답 타입
export interface CveApiResponse extends CVEDetailData {
  newComment?: CommentData;
  message?: string;
  status?: string;
}

export type MutationError = Error | AxiosError<{ detail?: string }>;

// 유틸리티 함수
export const extractMentions = (content: string): string[] =>
  content.match(/@(\w+)/g)?.map(mention => mention.substring(1)) || [];

/**
 * 댓글 관련 mutation hooks
 */
export const useCommentMutations = (
  cveId: string,
  currentUser?: { username: string; displayName?: string } | null,
  onCommentCountChange?: (count: number) => void,
  parentSendMessage?: (type: string, data: Record<string, unknown>) => Promise<boolean | null> | boolean | null
) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  // 낙관적 업데이트 유틸리티
  const performOptimisticUpdate = async (
    updateFn: (cachedData: CVEDetailData) => CVEDetailData
  ): Promise<CVEDetailData | null> => {
    const queryKey = QUERY_KEYS.CVE.detail(cveId);
    await queryClient.cancelQueries({ queryKey });
    const previousData = queryClient.getQueryData<CVEDetailData>(queryKey);

    if (previousData) {
      try {
        const optimisticData = updateFn(previousData);
        queryClient.setQueryData<CVEDetailData>(queryKey, optimisticData);
        logger.info('CommentsTab: 낙관적 업데이트 적용', { queryKey });
        const newActiveCount = (optimisticData.comments || []).filter(c => !c.isDeleted).length;
        onCommentCountChange?.(newActiveCount);
        return previousData;
      } catch (error) {
        logger.error('CommentsTab: 낙관적 업데이트 함수 오류', error);
        return previousData;
      }
    }
    return null;
  };

  // 공통 에러 핸들러
  const handleMutationError = (
    error: MutationError, 
    context: CVEDetailData | null | undefined, 
    defaultMessage: string
  ) => {
    logger.error(`${defaultMessage} 실패:`, error);
    if (context) { // 롤백
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), context);
      const rollbackActiveCount = (context.comments || []).filter(c => !c.isDeleted).length;
      onCommentCountChange?.(rollbackActiveCount);
    }
    // Axios 에러 응답에서 detail 메시지 추출 시도
    const detail = (error as AxiosError<{ detail?: string }>)?.response?.data?.detail;
    enqueueSnackbar(detail || defaultMessage, { variant: 'error' });
  };

  // 1. 댓글 생성 mutation
  const createCommentMutation = useMutation<CveApiResponse, MutationError, string, CVEDetailData | null>({
    mutationFn: async (content) => {
      const mentions = extractMentions(content);
      const response = await api.post<CveApiResponse>(`/cves/${cveId}/comments`, { content, mentions });
      return response.data;
    },
    onMutate: async (content) => {
      if (!currentUser) return null;
      return performOptimisticUpdate(cachedData => {
        const tempId = `temp-comment-${Date.now()}`;
        const tempComment: CommentData = { 
          id: tempId, 
          content, 
          author: currentUser.username, 
          authorName: currentUser.displayName || currentUser.username, 
          createdAt: new Date().toISOString(), 
          parentId: undefined, 
          isDeleted: false, 
          isOptimistic: true 
        };
        const comments = cachedData.comments || [];
        return { ...cachedData, comments: [...comments, tempComment] };
      });
    },
    onSuccess: async (responseData, content) => {
      logger.info('댓글 작성 성공', { 
        responseAvailable: !!responseData,
        commentsAvailable: !!responseData.comments,
        commentsCount: responseData.comments ? responseData.comments.length : 0,
        cveId
      });
      
      // 서버 응답에 comments 배열이 포함된 경우 캐시 업데이트
      if (responseData && responseData.comments) {
        logger.info('댓글 작성 후 전체 CVE 데이터 수신', { 
          commentsCount: responseData.comments.length 
        });
        
        // 소켓 이벤트 전송
        await parentSendMessage?.(SOCKET_EVENTS.COMMENT_ADDED, { 
          cveId, 
          data: { 
            comments: responseData.comments,
            author: currentUser?.username
          }, 
        });
        
        // 성공 시 캐시 업데이트
        queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), responseData);
        const newActiveCount = (responseData.comments || []).filter(c => !c.isDeleted).length;
        onCommentCountChange?.(newActiveCount);
        enqueueSnackbar('댓글이 작성되었습니다.', { variant: 'success' });
      } else {
        // 서버로부터 완전한 데이터를 받지 못한 경우 쿼리 무효화
        logger.warn('댓글 작성 성공했으나 응답에 comments 데이터가 유효하지 않음', responseData);
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.CVE.detail(cveId),
          refetchType: 'active'
        });
        enqueueSnackbar('댓글이 작성되었지만 최신 데이터를 가져오는 중입니다.', { variant: 'info' });
      }
    },
    onError: (error, variables, context) => 
      handleMutationError(error, context, '댓글 작성 중 오류 발생'),
  });

  // 2. 댓글 수정 mutation
  interface EditCommentVariables { 
    commentId: string; 
    content: string; 
  }

  const editCommentMutation = useMutation<CveApiResponse, MutationError, EditCommentVariables, CVEDetailData | null>({
    mutationFn: async ({ commentId, content }) => {
      const response = await api.patch<CveApiResponse>(`/cves/${cveId}/comments/${commentId}`, { content });
      return response.data;
    },
    onMutate: async ({ commentId, content }) => {
      return performOptimisticUpdate(cachedData => {
        const comments = cachedData.comments || [];
        const updatedComments = comments.map(c => 
          c.id === commentId 
            ? { 
                ...c, 
                content, 
                lastModifiedAt: new Date().toISOString(), 
                isOptimistic: true 
              } 
            : c
        );
        return { ...cachedData, comments: updatedComments };
      });
    },
    onSuccess: async (responseData, { commentId, content }) => {
      logger.info('댓글 수정 성공', { commentId });
      const mentions = extractMentions(content);
      if (mentions.length > 0 && currentUser) {
        await parentSendMessage?.(SOCKET_EVENTS.MENTION_ADDED, { 
          type: 'mention', 
          recipients: mentions, 
          content: `${currentUser.displayName || currentUser.username}님이 댓글에서 회원님을 멘션했습니다.`, 
          metadata: { cveId, commentId, comment_content: content } 
        });
      }
      await parentSendMessage?.(SOCKET_EVENTS.COMMENT_UPDATED, { 
        cveId, 
        cve: responseData,
        updatedCommentId: commentId 
      });
      // 성공 시 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), responseData);
      enqueueSnackbar('댓글이 수정되었습니다.', { variant: 'success' });
    },
    onError: (error, variables, context) => 
      handleMutationError(error, context, '댓글 수정 중 오류 발생'),
  });

  // 3. 답글 작성 mutation
  interface ReplyCommentVariables { 
    parentId: string; 
    content: string; 
  }

  const replyCommentMutation = useMutation<CveApiResponse, MutationError, ReplyCommentVariables, CVEDetailData | null>({
    mutationFn: async ({ parentId, content }) => {
      const mentions = extractMentions(content);
      const response = await api.post<CveApiResponse>(`/cves/${cveId}/comments`, { 
        content, 
        parent_id: parentId, 
        mentions 
      });
      return response.data;
    },
    onMutate: async ({ parentId, content }) => {
      if (!currentUser) return null;
      return performOptimisticUpdate(cachedData => {
        const tempId = `temp-reply-${Date.now()}`;
        const tempComment: CommentData = { 
          id: tempId, 
          content, 
          author: currentUser.username, 
          authorName: currentUser.displayName || currentUser.username, 
          createdAt: new Date().toISOString(), 
          parentId, 
          isDeleted: false, 
          isOptimistic: true 
        };
        const comments = cachedData.comments || [];
        return { ...cachedData, comments: [...comments, tempComment] };
      });
    },
    onSuccess: async (responseData, { parentId, content }) => {
      const newCommentId = responseData.newComment?.id;
      logger.info('답글 작성 성공', { parentId, newCommentId });
      const mentions = extractMentions(content);
      if (mentions.length > 0 && currentUser && newCommentId) {
        await parentSendMessage?.(SOCKET_EVENTS.MENTION_ADDED, { 
          type: 'mention', 
          recipients: mentions, 
          content: `${currentUser.displayName || currentUser.username}님이 답글에서 회원님을 멘션했습니다.`, 
          metadata: { cveId, commentId: newCommentId, comment_content: content } 
        });
      }
      await parentSendMessage?.(SOCKET_EVENTS.COMMENT_ADDED, { 
        cveId, 
        cve: responseData,
        newComment: responseData.newComment 
      });
      // 성공 시 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), responseData);
      const newActiveCount = (responseData.comments || []).filter(c => !c.isDeleted).length;
      onCommentCountChange?.(newActiveCount); // 댓글 수 업데이트
      enqueueSnackbar('답글이 작성되었습니다.', { variant: 'success' });
    },
    onError: (error, variables, context) => 
      handleMutationError(error, context, '답글 작성 중 오류 발생'),
  });

  // 4. 댓글 삭제 mutation
  interface DeleteCommentVariables { 
    commentId: string; 
    permanent: boolean; 
  }

  const deleteCommentMutation = useMutation<CveApiResponse, MutationError, DeleteCommentVariables, CVEDetailData | null>({
    mutationFn: async ({ commentId, permanent }) => {
      const response = await api.delete<CveApiResponse>(`/cves/${cveId}/comments/${commentId}`, { 
        params: { permanent } 
      });
      return response.data;
    },
    onMutate: async ({ commentId, permanent }) => {
      // 먼저 진행 중인 쿼리를 취소해서 낙관적 업데이트와 충돌 방지
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
      
      // 이전 상태 저장
      const previousData = queryClient.getQueryData<CVEDetailData>(QUERY_KEYS.CVE.detail(cveId));
      
      if (!previousData) return null;
      
      try {
        // 낙관적 업데이트 적용
        const cachedData = { ...previousData };
        const comments = cachedData.comments || [];
        
        // 영구 삭제 시 목록에서 제거, 소프트 삭제 시 isDeleted 플래그만 설정
        const updatedComments = permanent
          ? comments.filter(c => c.id !== commentId)
          : comments.map(c => c.id === commentId ? { ...c, isDeleted: true, isOptimistic: true } : c);
        
        const optimisticData = { ...cachedData, comments: updatedComments };
        
        // 캐시 업데이트
        queryClient.setQueryData<CVEDetailData>(QUERY_KEYS.CVE.detail(cveId), optimisticData);
        
        // 댓글 수 업데이트 (낙관적으로)
        const newActiveCount = updatedComments.filter(c => !c.isDeleted).length;
        onCommentCountChange?.(newActiveCount);
        
        logger.info('CommentsTab: 댓글 삭제 낙관적 업데이트 완료', { commentId, permanent });
        
        return previousData;
      } catch (error) {
        logger.error('CommentsTab: 낙관적 업데이트 오류', error);
        return previousData;
      }
    },
    onSuccess: async (responseData, { commentId, permanent }) => {
      logger.info('댓글 삭제 성공', { commentId, permanent });
      
      // 소켓 이벤트 발생
      await parentSendMessage?.(SOCKET_EVENTS.COMMENT_DELETED, { 
        cveId, 
        cve: responseData,
        deletedCommentId: commentId, 
        isPermanent: permanent 
      });
      
      // 이미 낙관적 업데이트를 통해 UI가 업데이트됐으므로,
      // 서버의 응답과 클라이언트 상태가 일치하는지 검증 후 
      // 필요한 경우에만 업데이트 (깜빡임 방지)
      const currentData = queryClient.getQueryData<CVEDetailData>(QUERY_KEYS.CVE.detail(cveId));
      
      if (currentData) {
        // 서버 응답에 낙관적 업데이트 마커 제거 (참조 비교를 위해)
        const sanitizedComments = responseData.comments?.map(comment => {
          const { isOptimistic, ...rest } = comment as any;
          return rest;
        });
        
        const updatedResponseData = {
          ...responseData,
          comments: sanitizedComments
        };
        
        // refetchActive: true 옵션은 사용하지 않고 수동으로 상태 관리
        // setQueryData로 상태 업데이트 (refetch 없이 상태 업데이트)
        queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), updatedResponseData);
      }
      
      // 댓글 수 업데이트
      const newActiveCount = (responseData.comments || []).filter(c => !c.isDeleted).length;
      onCommentCountChange?.(newActiveCount);
      
      enqueueSnackbar(permanent ? '댓글이 영구적으로 삭제되었습니다.' : '댓글이 삭제되었습니다.', { 
        variant: 'success' 
      });
    },
    onError: (error, variables, context) => {
      // 롤백 처리 개선
      if (context) {
        const previousData = context as CVEDetailData;
        // 원래 상태로 복원
        queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), previousData);
        
        // 댓글 수도 복원
        const rollbackActiveCount = (previousData.comments || []).filter(c => !c.isDeleted).length;
        onCommentCountChange?.(rollbackActiveCount);
      }
      
      // 사용자에게 오류 알림
      const detail = (error as AxiosError<{ detail?: string }>)?.response?.data?.detail;
      enqueueSnackbar(detail || '댓글 삭제 중 오류가 발생했습니다.', { variant: 'error' });
      
      logger.error('댓글 삭제 실패:', error);
    }
  });

  return {
    createCommentMutation,
    editCommentMutation,
    replyCommentMutation,
    deleteCommentMutation,
    // 편의를 위한 핸들러 함수들
    createComment: (content: string) => {
      if (!content.trim()) {
        enqueueSnackbar('댓글 내용을 입력해주세요.', { variant: 'warning' });
        return;
      }
      createCommentMutation.mutate(content);
    },
    editComment: (commentId: string, content: string) => {
      if (!content.trim()) {
        enqueueSnackbar('댓글 내용을 입력해주세요.', { variant: 'warning' });
        return;
      }
      editCommentMutation.mutate({ commentId, content });
    },
    replyComment: (parentId: string, content: string) => {
      if (!content.trim()) {
        enqueueSnackbar('답글 내용을 입력해주세요.', { variant: 'warning' });
        return;
      }
      replyCommentMutation.mutate({ parentId, content });
    },
    deleteComment: (commentId: string, permanent: boolean = false) => {
      deleteCommentMutation.mutate({ commentId, permanent });
    },
    // 로딩 상태 통합
    isLoading: 
      createCommentMutation.isPending || 
      editCommentMutation.isPending || 
      replyCommentMutation.isPending || 
      deleteCommentMutation.isPending
  };
};