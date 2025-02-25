import React, { useEffect, useRef } from 'react';

const CommentsTab = ({ cveId }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const wsRef = useRef(null);

  useEffect(() => {
    // WebSocket 연결 설정
    const ws = new WebSocket(`${process.env.REACT_APP_WS_URL}/ws/comments/${cveId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'comments_update') {
        setComments(data.comments);
      }
    };

    // 컴포넌트가 언마운트되거나 cveId가 변경될 때만 정리
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cveId]); // cveId가 변경될 때만 실행

  // 탭 전환 시에도 WebSocket 연결 유지
  useEffect(() => {
    return () => {
      // 컴포넌트가 완전히 언마운트될 때만 정리
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // ... 나머지 코드 ...
};

export default CommentsTab; 