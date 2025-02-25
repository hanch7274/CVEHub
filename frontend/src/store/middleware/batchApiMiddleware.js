// API 요청 배치 처리 미들웨어
export const batchApiMiddleware = store => next => {
  let batchedRequests = [];
  let batchTimer = null;
  
  return action => {
    if (action.type === 'api/request') {
      // 요청 배치에 추가
      batchedRequests.push(action.payload);
      
      // 20ms 후에 배치 처리
      if (!batchTimer) {
        batchTimer = setTimeout(() => {
          // 배치된 요청 처리
          if (batchedRequests.length > 0) {
            api.post('/batch', { requests: batchedRequests })
              .then(response => {
                response.data.forEach((result, index) => {
                  const originalAction = batchedRequests[index];
                  store.dispatch({
                    type: 'api/success',
                    payload: {
                      requestId: originalAction.requestId,
                      data: result
                    }
                  });
                });
              })
              .catch(error => {
                // 에러 처리
              });
            
            batchedRequests = [];
          }
          batchTimer = null;
        }, 20);
      }
      
      return;
    }
    
    return next(action);
  };
}; 