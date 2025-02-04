import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../utils/auth';

// Async Thunks
export const fetchCVEList = createAsyncThunk(
  'cve/fetchList',
  async ({ skip, limit }, { rejectWithValue }) => {
    try {
      const response = await api.get('/cves', {
        params: { skip, limit }
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || '데이터를 불러오는데 실패했습니다.');
    }
  }
);

export const fetchCVEDetail = createAsyncThunk(
  'cve/fetchDetail',
  async (cveId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/cves/${cveId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || '상세 정보를 불러오는데 실패했습니다.');
    }
  }
);

export const updateCVEDetail = createAsyncThunk(
  'cve/updateDetail',
  async ({ cveId, data }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/cves/${cveId}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || '업데이트에 실패했습니다.');
    }
  }
);

// Initial State
const initialState = {
  list: {
    items: [],
    total: 0,
    loading: false,
    error: null,
    lastUpdated: null
  },
  details: {
    byId: {},
    loading: false,
    error: null
  },
  activeFilters: {
    search: '',
    status: null,
    page: 0,
    rowsPerPage: 10
  }
};

// Slice
const cveSlice = createSlice({
  name: 'cve',
  initialState,
  reducers: {
    // WebSocket을 통한 업데이트
    updateCVEFromWebSocket: (state, action) => {
      const updatedCVE = action.payload;
      // 리스트 업데이트
      state.list.items = state.list.items.map(cve =>
        cve.cveId === updatedCVE.cveId ? updatedCVE : cve
      );
      // 상세 정보 업데이트
      state.details.byId[updatedCVE.cveId] = updatedCVE;
      state.list.lastUpdated = new Date().toISOString();
    },
    // 필터 업데이트
    updateFilters: (state, action) => {
      state.activeFilters = {
        ...state.activeFilters,
        ...action.payload
      };
    },
    // 캐시 초기화
    clearCache: (state) => {
      state.details.byId = {};
      state.list.lastUpdated = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // 목록 조회
      .addCase(fetchCVEList.pending, (state) => {
        state.list.loading = true;
        state.list.error = null;
      })
      .addCase(fetchCVEList.fulfilled, (state, action) => {
        state.list.loading = false;
        state.list.items = action.payload.items;
        state.list.total = action.payload.total;
        state.list.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchCVEList.rejected, (state, action) => {
        state.list.loading = false;
        state.list.error = action.payload;
      })
      // 상세 조회
      .addCase(fetchCVEDetail.pending, (state) => {
        state.details.loading = true;
        state.details.error = null;
      })
      .addCase(fetchCVEDetail.fulfilled, (state, action) => {
        console.log('[Redux fetchCVEDetail] Received payload:', action.payload);
        state.details.loading = false;
        state.details.byId[action.payload.cveId] = action.payload;
        console.log('[Redux fetchCVEDetail] Updated state:', state.details.byId[action.payload.cveId]);
      })
      .addCase(fetchCVEDetail.rejected, (state, action) => {
        state.details.loading = false;
        state.details.error = action.payload;
      })
      // 업데이트
      .addCase(updateCVEDetail.fulfilled, (state, action) => {
        const updatedCVE = action.payload;
        console.log('[Redux updateCVEDetail] Received payload:', updatedCVE);
        console.log('[Redux updateCVEDetail] Current state before update:', state.details.byId[updatedCVE.cveId]);
        state.details.byId[updatedCVE.cveId] = updatedCVE;
        state.list.items = state.list.items.map(cve =>
          cve.cveId === updatedCVE.cveId ? updatedCVE : cve
        );
        console.log('[Redux updateCVEDetail] Updated state:', state.details.byId[updatedCVE.cveId]);
      });
  }
});

export const { updateCVEFromWebSocket, updateFilters, clearCache } = cveSlice.actions;

// Selectors
export const selectCVEList = (state) => state.cve.list;
export const selectCVEDetail = (cveId) => (state) => state.cve.details.byId[cveId];
export const selectCVEFilters = (state) => state.cve.activeFilters;
export const selectCVELoading = (state) => state.cve.list.loading || state.cve.details.loading;

export default cveSlice.reducer; 