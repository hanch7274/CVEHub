// frontend/src/store/slices/cveSlice.js

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { createSelector } from 'reselect';
import { api } from '../../utils/auth';
import { cveService } from '../../api/services/cveService';
import { snakeToCamel } from '../../utils/caseConverter';

// 초기 상태
const initialState = {
  list: {
    items: [],
    total: 0,
    loading: false,
    error: null,
  },
  detail: {
    item: null,
    loading: false,
    error: null,
  },
  filters: {
    page: 0,
    rowsPerPage: 10,
    search: '',
    status: '전체', // 상태 필드 추가
  },
  forceRefresh: false,
  lastUpdated: null,
  byId: {},
  currentCVE: null,
  cveCache: {},
  cacheTTL: 5 * 60 * 1000, // 캐시 유효 시간 (5분)
};

export const fetchCVEList = createAsyncThunk(
  'cve/fetchList',
  async (params) => {
    const response = await cveService.getCVEs(params);
    return response;
  }
);

export const fetchCVEDetail = createAsyncThunk(
  'cve/fetchDetail',
  async (cveId, { rejectWithValue }) => {
    try {
      console.log('Fetching CVE detail for:', cveId);
      const response = await cveService.getCVEById(cveId);
      console.log('CVE detail response:', response);
      return response;
    } catch (error) {
      console.error('Error fetching CVE detail:', error);
      return rejectWithValue(
        error.response?.data?.detail || '상세 정보를 불러오는데 실패했습니다.'
      );
    }
  }
);

export const updateCVEDetail = createAsyncThunk(
  'cves/updateCVEDetail',
  async ({ cveId, data }, { rejectWithValue }) => {
    try {
      const response = await cveService.updateCVE(cveId, data);
      return response;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const deleteCVE = createAsyncThunk(
  'cve/delete',
  async (cveId, { dispatch, rejectWithValue }) => {
    try {
      await api.delete(`/cves/${cveId}`);
      await dispatch(fetchCVEList({ skip: 0, limit: 10 }));
      return cveId;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.detail || '삭제에 실패했습니다.'
      );
    }
  }
);

export const updateCVEFromWebSocketThunk = createAsyncThunk(
  'cve/updateFromWebSocket',
  async (cveData, { dispatch }) => {
    // 웹소켓 업데이트 시 해당 CVE 캐시 무효화
    if (cveData.cveId) {
      dispatch(invalidateCache(cveData.cveId));
    }
    return cveData;
  }
);

export const createCVE = createAsyncThunk(
  'cve/create',
  async (cveData, { rejectWithValue }) => {
    try {
      console.log('[CVE Slice] Creating CVE with data:', cveData);
      const response = await cveService.createCVE(cveData);
      console.log('[CVE Slice] Creation response:', response);
      return response;
    } catch (error) {
      console.error('[CVE Slice] Creation error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const addCommentToStore = createAsyncThunk(
  'cve/addComment',
  async ({ cveId, comment }) => {
    return { cveId, comment };
  }
);

export const prefetchCVE = createAsyncThunk(
  'cve/prefetchCVE',
  async (id, { dispatch }) => {
    const response = await api.get(`/cves/${id}`);
    return response.data;
  }
);

export const checkCacheStatus = (state, cveId) => {
  const cached = state.cveCache[cveId];
  if (!cached) return { exists: false };
  
  const now = Date.now();
  const isFresh = cached._cachedAt && (now - cached._cachedAt < state.cacheTTL);
  
  return {
    exists: true,
    isFresh,
    data: cached
  };
};

export const fetchCachedCVEDetail = createAsyncThunk(
  'cve/fetchCachedCVEDetail',
  async (cveId, { getState, dispatch }) => {
    try {
      // 지능형 캐싱 로직을 활용한 데이터 가져오기
      const cveData = await cveService.getCVEById(cveId, { 
        checkModified: true // 항상 수정 여부 확인
      });
      
      // 데이터에 캐시 메타데이터 추가
      const enhancedData = {
        ...cveData,
        _fromCache: true,
        _cachedAt: Date.now(),
        _lastCheckedWithServer: Date.now()
      };
      
      return enhancedData;
    } catch (error) {
      console.error('Error fetching cached CVE:', error);
      return dispatch(fetchCVEDetail(cveId)).unwrap();
    }
  }
);

export const invalidateCache = createAsyncThunk(
  'cve/invalidateCache',
  async (cveId, { dispatch }) => {
    return cveId;
  }
);

export const cveSlice = createSlice({
  name: 'cve',
  initialState,
  reducers: {
    updateFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    refreshCVEList: (state) => {
      state.forceRefresh = !state.forceRefresh;
    },
    deleteCVEFromWebSocket: (state, action) => {
      state.list.items = state.list.items.filter(
        (cve) => cve.cveId !== action.payload
      );
    },
    addCVEFromWebSocket: (state, action) => {
      if (!state.list.items.find((cve) => cve.cveId === action.payload.cveId)) {
        state.list.items.push(action.payload);
      }
    },
    updateCVEFromWebSocket: (state, action) => {
      const cveData = snakeToCamel(action.payload);
      if (state.currentCVE?.cveId === cveData.cveId) {
        state.currentCVE = cveData;
      }
      const index = state.list.items.findIndex(
        (cve) => cve.cveId === cveData.cveId
      );
      if (index !== -1) {
        state.list.items[index] = cveData;
      }
      state.byId[cveData.cveId] = cveData;
    },
    deleteCVEFromWebSocket: (state, action) => {
      console.log('[Redux deleteCVEFromWebSocket] Received:', action.payload);
      const deletedCveId = action.payload;
      state.list.items = state.list.items.filter(
        (cve) => cve.cveId !== deletedCveId
      );
      if (state.list.total > 0) {
        state.list.total -= 1;
      }
    },
    setCVEDetail: (state, action) => {
      state.currentCVE = action.payload;
      
      // 캐시도 함께 업데이트
      if (action.payload && action.payload.cveId) {
        state.cveCache[action.payload.cveId] = {
          ...action.payload,
          _cachedAt: Date.now(),
          _lastCheckedWithServer: Date.now()
        };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCVEList.pending, (state) => {
        state.list.loading = true;
        state.list.error = null;
      })
      .addCase(fetchCVEList.fulfilled, (state, action) => {
        console.log('[CVE Slice] Updating state with:', action.payload);
        const items = Array.isArray(action.payload.items)
          ? action.payload.items
          : [];
        state.list = {
          ...state.list,
          items: items,
          total: action.payload.total || 0,
          loading: false,
          error: null,
        };
        state.forceRefresh = false;
        state.lastUpdated = new Date().toISOString();
        items.forEach((item) => {
          if (item.cveId) {
            state.byId[item.cveId] = item;
          }
        });
      })
      .addCase(fetchCVEList.rejected, (state, action) => {
        state.list.loading = false;
        state.list.error = action.error.message;
      })
      .addCase(deleteCVE.pending, (state) => {
        state.list.loading = true;
        state.list.error = null;
      })
      .addCase(deleteCVE.fulfilled, (state, action) => {
        state.list.loading = false;
        state.list.items = state.list.items.filter(
          (cve) => cve.cveId !== action.payload
        );
        state.list.total = state.list.total - 1;
        if (state.byId[action.payload]) {
          delete state.byId[action.payload];
        }
      })
      .addCase(deleteCVE.rejected, (state, action) => {
        state.list.loading = false;
        state.list.error = action.payload;
      })
      .addCase(fetchCVEDetail.pending, (state) => {
        state.detail.loading = true;
        state.detail.error = null;
      })
      .addCase(fetchCVEDetail.fulfilled, (state, action) => {
        console.log('[Redux fetchCVEDetail] Received payload:', action.payload);
        state.detail.loading = false;
        state.detail.item = action.payload;
        state.currentCVE = action.payload;
        if (action.payload?.cveId) {
          state.byId[action.payload.cveId] = action.payload;
          state.cveCache[action.payload.cveId] = {
            ...action.payload,
            _cachedAt: Date.now() // 캐시 생성 시간 저장
          };
        }
      })
      .addCase(fetchCVEDetail.rejected, (state, action) => {
        state.detail.loading = false;
        state.detail.error = action.payload;
      })
      .addCase(updateCVEDetail.fulfilled, (state, action) => {
        if (action.payload) {
          const updatedCVE = action.payload;
          state.currentCVE = updatedCVE;
          state.detail = { ...state.detail, item: updatedCVE };
          if (updatedCVE.cveId) {
            state.byId[updatedCVE.cveId] = updatedCVE;
            const index = state.list.items.findIndex(cve => cve.cveId === updatedCVE.cveId);
            if (index !== -1) {
              state.list.items[index] = updatedCVE;
            }
          }
        }
      })
      .addCase(updateCVEFromWebSocketThunk.fulfilled, (state, action) => {
        console.log('[Redux] Processing WebSocket update:', action.payload);
        const index = state.list.items.findIndex(cve => cve.cveId === action.payload.cveId);
        if (index !== -1) {
          state.list.items[index] = action.payload;
          console.log('[Redux] CVE updated at index:', index);
        }
      })
      .addCase(createCVE.pending, (state) => {
        state.list.loading = true;
        state.list.error = null;
      })
      .addCase(createCVE.fulfilled, (state, action) => {
        state.list.loading = false;
        state.list.items.unshift(action.payload);
        state.list.total += 1;
        if (action.payload.cveId) {
          state.byId[action.payload.cveId] = action.payload;
        }
      })
      .addCase(createCVE.rejected, (state, action) => {
        state.list.loading = false;
        state.list.error = action.payload;
      })
      .addCase(addCommentToStore.fulfilled, (state, action) => {
        const { cveId, comment } = action.payload;
        if (state.detail && state.detail.cveId === cveId) {
          state.detail.comments = [...(state.detail.comments || []), comment];
        }
      })
      .addCase(prefetchCVE.fulfilled, (state, action) => {
        state.cveCache[action.payload.cveId] = action.payload;
      })
      .addCase(invalidateCache.fulfilled, (state, action) => {
        const cveId = action.payload;
        if (cveId && state.cveCache[cveId]) {
          delete state.cveCache[cveId]; // 캐시 무효화
        }
      });
  },
});

const selectCVEState = (state) => state.cve || initialState;

export const selectCVEDetail = createSelector(
  [selectCVEState],
  (cveState) => cveState.currentCVE || null
);

// 목록 데이터를 반환하는 셀렉터 추가
export const selectCVEListData = createSelector(
  (state) => state.cve?.list?.items,
  (state) => state.cve?.list?.total,
  (state) => state.cve?.list?.loading,
  (state) => state.cve?.list?.error,
  (state) => state.cve?.forceRefresh,
  (items, total, loading, error, forceRefresh) => ({
    items: items || [],
    total: total || 0,
    loading: loading || false,
    error,
    forceRefresh,
  })
);

export const selectCVEFiltersData = createSelector(
  (state) => state.cve?.filters?.page,
  (state) => state.cve?.filters?.rowsPerPage,
  (state) => state.cve?.filters?.search,
  (state) => state.cve?.filters?.status,
  (page, rowsPerPage, search, status) => ({
    page: page || 0,
    rowsPerPage: rowsPerPage || 10,
    search: search || '',
    status: status || "전체"
  })
);

export const selectCVELoading = createSelector(
  [selectCVEState],
  (cveState) => cveState.list?.loading || cveState.detail?.loading || false
);

export const {
  updateFilters,
  refreshCVEList,
  deleteCVEFromWebSocket,
  addCVEFromWebSocket,
  setCVEDetail,
} = cveSlice.actions;

export { updateCVEFromWebSocketThunk as updateCVEFromWebSocket };

export default cveSlice.reducer;
