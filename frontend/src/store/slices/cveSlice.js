import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { createSelector } from 'reselect';
import { api } from '../../utils/auth';
import { cveService } from '../../api/services/cveService';
import { snakeToCamel } from '../../utils/caseConverter';

// 초기 상태 정의를 하나로 통일
const initialState = {
  list: {
    items: [],
    total: 0,
    loading: false,
    error: null
  },
  detail: {
    item: null,
    loading: false,
    error: null
  },
  filters: {
    page: 0,
    rowsPerPage: 10,
    search: ''
  },
  forceRefresh: false,
  lastUpdated: null,
  byId: {},
  currentCVE: null  // 현재 선택된 CVE 상세 정보
};

// CVE 목록 조회
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
      return rejectWithValue(error.response?.data?.detail || '상세 정보를 불러오는데 실패했습니다.');
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

// 삭제 액션 추가
export const deleteCVE = createAsyncThunk(
  'cve/delete',
  async (cveId, { dispatch, rejectWithValue }) => {
    try {
      await api.delete(`/cves/${cveId}`);
      // 삭제 성공 후 리스트 새로고침
      await dispatch(fetchCVEList({ skip: 0, limit: 10 }));
      return cveId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || '삭제에 실패했습니다.');
    }
  }
);

export const updateCVEFromWebSocketThunk = createAsyncThunk(
  'cve/updateFromWebSocket',
  async (cveData) => {
    console.log('[Redux] Updating CVE from WebSocket:', cveData);
    return cveData;
  }
);

// CVE 생성 액션 추가
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
                message: error.message
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
        cve => cve.cveId !== action.payload
      );
    },
    addCVEFromWebSocket: (state, action) => {
      if (!state.list.items.find(cve => cve.cveId === action.payload.cveId)) {
        state.list.items.push(action.payload);
      }
    },
    // WebSocket 이벤트로 인한 CVE 업데이트
    updateCVEFromWebSocket: (state, action) => {
      // 백엔드에서 받은 데이터를 카멜케이스로 변환
      const cveData = snakeToCamel(action.payload);

      // 현재 CVE 업데이트
      if (state.currentCVE?.cveId === cveData.cveId) {
        state.currentCVE = cveData;
      }

      // 리스트 업데이트
      const index = state.list.items.findIndex(cve => cve.cveId === cveData.cveId);
      if (index !== -1) {
        state.list.items[index] = cveData;
      }

      // byId 업데이트
      state.byId[cveData.cveId] = cveData;
    },
    // WebSocket 이벤트로 인한 CVE 삭제
    deleteCVEFromWebSocket: (state, action) => {
      console.log('[Redux deleteCVEFromWebSocket] Received:', action.payload);
      const deletedCveId = action.payload;
      
      // 현재 페이지에서 삭제
      state.list.items = state.list.items.filter(cve => cve.cveId !== deletedCveId);
      if (state.list.total > 0) {
        state.list.total -= 1;
      }
    },
    // CVE 상세 정보 설정
    setCVEDetail: (state, action) => {
      state.currentCVE = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCVEList.pending, (state) => {
        state.list.loading = true;
        state.list.error = null;
      })
      .addCase(fetchCVEList.fulfilled, (state, action) => {
        console.log('[CVE Slice] Updating state with:', action.payload);
        // items가 배열인지 확인
        const items = Array.isArray(action.payload.items) ? action.payload.items : [];
        
        state.list = {
          ...state.list,
          items: items,
          total: action.payload.total || 0,
          loading: false,
          error: null
        };
        
        state.forceRefresh = false;
        state.lastUpdated = new Date().toISOString();
        
        // byId 업데이트
        items.forEach(item => {
          if (item.cveId) {
            state.byId[item.cveId] = item;
          }
        });
      })
      .addCase(fetchCVEList.rejected, (state, action) => {
        state.list.loading = false;
        state.list.error = action.error.message;
      })
      // 삭제 액션 처리 추가
      .addCase(deleteCVE.pending, (state) => {
        state.list.loading = true;
        state.list.error = null;
      })
      .addCase(deleteCVE.fulfilled, (state, action) => {
        state.list.loading = false;
        // 삭제된 CVE를 상태에서 제거
        state.list.items = state.list.items.filter(cve => cve.cveId !== action.payload);
        state.list.total = state.list.total - 1;
        if (state.byId[action.payload]) {
          delete state.byId[action.payload];
        }
      })
      .addCase(deleteCVE.rejected, (state, action) => {
        state.list.loading = false;
        state.list.error = action.payload;
      })
      // 상세 조회
      .addCase(fetchCVEDetail.pending, (state) => {
        state.detail.loading = true;
        state.detail.error = null;
      })
      .addCase(fetchCVEDetail.fulfilled, (state, action) => {
        console.log('[Redux fetchCVEDetail] Received payload:', action.payload);
        state.detail.loading = false;
        state.detail.item = action.payload;
        state.currentCVE = action.payload;  // currentCVE도 업데이트
        if (action.payload?.cveId) {
          state.byId[action.payload.cveId] = action.payload;
        }
      })
      .addCase(fetchCVEDetail.rejected, (state, action) => {
        state.detail.loading = false;
        state.detail.error = action.payload;
      })
      // 업데이트
      .addCase(updateCVEDetail.fulfilled, (state, action) => {
        if (action.payload) {
          // 상태 업데이트를 더 안전하게 처리
          const updatedCVE = action.payload;
          state.detail.item = updatedCVE;
          state.currentCVE = updatedCVE;
          if (updatedCVE.cveId) {
            state.byId[updatedCVE.cveId] = updatedCVE;
            
            // list.items 업데이트도 추가
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
      // CVE 생성 액션 추가
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
      });
  }
});

// 기본 선택자 수정
const selectCVEState = (state) => state.cve || initialState;

// 안전한 셀렉터 구현 (createSelector 사용)
export const selectCVEDetail = createSelector(
  [selectCVEState],
  (cveState) => cveState.currentCVE || null
);

// CVE 상세 정보를 ID로 조회하는 선택자
export const makeSelectCVEById = () => {
  return createSelector(
    [selectCVEState, (_, cveId) => cveId],
    (cveState, cveId) => {
      if (cveState.detail?.item?.cveId === cveId) {
        return cveState.detail.item;
      }
      return cveState.byId?.[cveId] || null;
    }
  );
};

export const selectCVEListData = createSelector(
  state => state.cve?.list?.items,
  state => state.cve?.list?.total,
  state => state.cve?.list?.loading,
  state => state.cve?.list?.error,
  state => state.cve?.forceRefresh,
  (items, total, loading, error, forceRefresh) => ({
    items: items || [],
    total: total || 0,
    loading: loading || false,
    error,
    forceRefresh
  })
);

export const selectCVEFiltersData = createSelector(
  state => state.cve?.filters?.page,
  state => state.cve?.filters?.rowsPerPage,
  state => state.cve?.filters?.search,
  (page, rowsPerPage, search) => ({
    page: page || 0,
    rowsPerPage: rowsPerPage || 10,
    search: search || ''
  })
);

export const selectCVELoading = createSelector(
  [selectCVEState],
  (cveState) => cveState.list?.loading || cveState.detail?.loading || false
);

// Regular actions export
export const {
  updateFilters,
  refreshCVEList,
  deleteCVEFromWebSocket,
  addCVEFromWebSocket,
  setCVEDetail
} = cveSlice.actions;

// updateCVEFromWebSocketThunk를 updateCVEFromWebSocket로 재export
export { updateCVEFromWebSocketThunk as updateCVEFromWebSocket };

export default cveSlice.reducer; 