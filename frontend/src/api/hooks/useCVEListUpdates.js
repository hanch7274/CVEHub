import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketIO } from '../../contexts/SocketIOContext';
import { QUERY_KEYS } from '../queryKeys';

/**
 * CVE 목록의 실시간 업데이트를 처리하는 훅
 * Socket.IO를 사용하여 서버로부터 CVE 업데이트를 구독하고 React Query 캐시를 업데이트함
 */
const useCVEListUpdates = () => {
  const { socket, connected } = useSocketIO();
  const queryClient = useQueryClient();

  // CVE 생성 이벤트 처리 함수
  const handleCVECreated = useCallback((newCVE) => {
    console.log('CVE 생성됨:', newCVE);

    // 쿼리 캐시 갱신
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_LIST] });
  }, [queryClient]);

  // CVE 업데이트 이벤트 처리 함수
  const handleCVEUpdated = useCallback((updatedCVE) => {
    console.log('CVE 업데이트됨:', updatedCVE);

    // CVE 상세 쿼리 캐시 갱신
    queryClient.invalidateQueries({ 
      queryKey: [QUERY_KEYS.CVE_DETAIL, updatedCVE.id] 
    });

    // 목록 쿼리도 갱신 (필터링/정렬에 영향을 줄 수 있음)
    queryClient.invalidateQueries({ 
      queryKey: [QUERY_KEYS.CVE_LIST] 
    });
  }, [queryClient]);

  // CVE 삭제 이벤트 처리 함수
  const handleCVEDeleted = useCallback((deletedCVEId) => {
    console.log('CVE 삭제됨:', deletedCVEId);

    // 쿼리 캐시 갱신
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_LIST] });
    
    // 해당 상세 쿼리도 무효화
    queryClient.invalidateQueries({ 
      queryKey: [QUERY_KEYS.CVE_DETAIL, deletedCVEId] 
    });
  }, [queryClient]);

  // 소켓 연결 및 이벤트 리스너 등록
  useEffect(() => {
    if (!socket || !connected) return;

    // 이벤트 리스너 등록
    socket.on('cve:created', handleCVECreated);
    socket.on('cve:updated', handleCVEUpdated);
    socket.on('cve:deleted', handleCVEDeleted);

    // 구독 요청
    socket.emit('subscribe:cves');

    // 클린업 함수
    return () => {
      socket.off('cve:created', handleCVECreated);
      socket.off('cve:updated', handleCVEUpdated);
      socket.off('cve:deleted', handleCVEDeleted);
      
      // 구독 해제
      socket.emit('unsubscribe:cves');
    };
  }, [socket, connected, handleCVECreated, handleCVEUpdated, handleCVEDeleted]);

  return { isConnected: connected };
};

export default useCVEListUpdates; 