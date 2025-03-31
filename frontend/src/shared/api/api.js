import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const api = createApi({
  baseQuery: fetchBaseQuery({ 
    baseUrl: '/api',
    prepareHeaders: (headers, { getState }) => {
      const token = getState().auth.token;
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return headers;
    } 
  }),
  
  tagTypes: ['CVE', 'CVEList', 'User'],
  
  endpoints: (builder) => ({
    getCVEList: builder.query({
      query: (params) => ({
        url: `/cve/list`,
        params: {
          ...params,
          _t: Date.now() // 캐시 버스팅용 타임스탬프 추가
        }
      }),
      providesTags: (result) => 
        result
          ? [
              ...result.items.map(({ cveId }) => ({ type: 'CVE', id: cveId })),
              { type: 'CVEList', id: 'LIST' }
            ]
          : [{ type: 'CVEList', id: 'LIST' }],
      // 30초 캐시 - 백엔드 캐시와 적절히 조율
      keepUnusedDataFor: 30,
    }),
    
    getCVEDetail: builder.query({
      query: ({ cveId, bypassCache }) => ({
        url: `/cve/${cveId}`,
        params: bypassCache ? { bypass_cache: true, _t: Date.now() } : {}
      }),
      providesTags: (result, error, arg) => 
        result ? [{ type: 'CVE', id: arg.cveId }] : [],
      // 5분 캐시
      keepUnusedDataFor: 300,
    }),
    
    // 웹소켓 이벤트에 따른 캐시 무효화 로직은 소켓 핸들러에서 처리
  })
});

export const { 
  useGetCVEListQuery, 
  useGetCVEDetailQuery,
  useLazyGetCVEDetailQuery 
} = api; 