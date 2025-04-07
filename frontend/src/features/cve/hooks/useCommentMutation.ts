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

export interface CveApiResponse {
  data: CVEDetailData;
  newComment?: CommentData;
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
      const newCommentId = responseData.newComment?.id;
      logger.info('새 댓글 작성 성공', { newCommentId });
      const mentions = extractMentions(content);
      if (mentions.length > 0 && currentUser && newCommentId) {
        await parentSendMessage?.(SOCKET_EVENTS.MENTION_ADDED, { 
          type: 'mention', 
          recipients: mentions, 
          content: `${currentUser.displayName || currentUser.username}님이 댓글에서 회원님을 멘션했습니다.`, 
          metadata: { cveId, commentId: newCommentId, comment_content: content } 
        });
      }
      await parentSendMessage?.(SOCKET_EVENTS.COMMENT_ADDED, { 
        cveId, 
        cve: responseData.data, 
        newComment: responseData.newComment 
      });
      // 성공 시 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), responseData.data);
      const newActiveCount = (responseData.data.comments || []).filter(c => !c.isDeleted).length;
      onCommentCountChange?.(newActiveCount);
      enqueueSnackbar('댓글이 작성되었습니다.', { variant: 'success' });
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
        cve: responseData.data, 
        updatedCommentId: commentId 
      });
      // 성공 시 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), responseData.data);
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
        cve: responseData.data, 
        newComment: responseData.newComment 
      });
      // 성공 시 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), responseData.data);
      const newActiveCount = (responseData.data.comments || []).filter(c => !c.isDeleted).length;
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
      return performOptimisticUpdate(cachedData => {
        const comments = cachedData.comments || [];
        // 영구 삭제 시 낙관적으로 제거, 소프트 삭제 시 isDeleted 플래그만 업데이트
        const updatedComments = permanent
          ? comments.filter(c => c.id !== commentId)
          : comments.map(c => c.id === commentId ? { ...c, isDeleted: true, isOptimistic: true } : c);
        return { ...cachedData, comments: updatedComments };
      });
    },
    onSuccess: async (responseData, { commentId, permanent }) => {
      logger.info('댓글 삭제 성공', { commentId, permanent });
      await parentSendMessage?.(SOCKET_EVENTS.COMMENT_DELETED, { 
        cveId, 
        cve: responseData.data, 
        deletedCommentId: commentId, 
        isPermanent: permanent 
      });
      // 성공 시 캐시 업데이트 (서버 응답 기준)
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), responseData.data);
      const newActiveCount = (responseData.data.comments || []).filter(c => !c.isDeleted).length;
      onCommentCountChange?.(newActiveCount); // 댓글 수 업데이트
      enqueueSnackbar(permanent ? '댓글이 영구적으로 삭제되었습니다.' : '댓글이 삭제되었습니다.', { 
        variant: 'success' 
      });
    },
    onError: (error, variables, context) => 
      handleMutationError(error, context, '댓글 삭제 중 오류 발생'),
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