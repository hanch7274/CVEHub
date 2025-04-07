import React, { useState, useEffect, useCallback, useMemo, memo, ReactNode } from 'react';
import {
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Fade,
  Button,
  CircularProgress, // 로딩 상태 표시
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Launch as LaunchIcon,
  SvgIconComponent, // 아이콘 타입
} from '@mui/icons-material';
import {
  StyledListItem,
  ActionButton,
  ActionIconButton,
  ListHeader,
  EmptyState,
} from './CommonStyles'; // 스타일 컴포넌트 경로 (확인 필요)
import { useQueryClient, InvalidateQueryFilters } from '@tanstack/react-query'; // React Query 타입
import api from 'shared/api/config/axios'; // Axios 인스턴스 경로 (확인 필요)
import { useSnackbar, OptionsObject, SnackbarMessage } from 'notistack'; // 스낵바 타입
import { SOCKET_EVENTS } from 'core/socket/services/constants'; // 소켓 상수 경로 (확인 필요)
import { useSocket } from 'core/socket/hooks/useSocket'; // useSocket 훅 경로 (확인 필요)
import { formatDateTime } from 'shared/utils/dateUtils'; // 날짜 유틸 경로 (확인 필요)
import { AxiosError } from 'axios'; // Axios 타입
import { QUERY_KEYS } from 'shared/api/queryKeys'; // 쿼리 키 경로 (확인 필요)
import logger from 'shared/utils/logging'; // 로거 경로 (확인 필요)

// --- 인터페이스 및 타입 정의 ---

// User 타입 (다른 파일에서 import 하거나 여기서 정의)
interface User {
  id?: string | number; // id 추가
  username: string;
  // 필요한 다른 사용자 속성...
}

// CVE 데이터 타입 (최소 필요 필드)
interface CVEDetailData {
  cveId: string;
  // dataField에 해당하는 필드를 포함해야 함 (인덱스 시그니처 사용 또는 구체적 필드 명시)
  [key: string]: any; // 실제 타입에 맞게 수정 권장
}

// 기본 아이템 인터페이스 (모든 데이터 아이템의 기본 구조)
interface BaseItem {
  id?: string | number; // id는 백엔드에서 오는 실제 식별자일 수 있음
  description?: string;
  created_by?: string; // 기존 소스코드와 필드명 통일
  created_at?: string | Date; // 기존 소스코드와 필드명 통일
  last_modified_by?: string; // 수정자 정보 (필요시)
  last_modified_at?: string | Date; // 수정 시간 (필요시)
  url?: string; // URL 속성
  [key: string]: any; // 유연성을 위한 인덱스 시그니처 (구체적인 타입 사용 권장)
}

// 각 탭에서 사용될 구체적인 아이템 타입 (BaseItem 확장, 예시)
interface PoCItem extends BaseItem {
  source: string;
  url: string; // 필수
}

interface SnortRuleItem extends BaseItem {
  type: string;
  rule: string; // 필수
}

interface ReferenceItem extends BaseItem {
  type: string;
  url: string; // 필수
}

// 모든 아이템 타입을 포함하는 유니온 타입 (구체적인 타입 추가 필요)
type DataItem = BaseItem & (PoCItem | SnortRuleItem | ReferenceItem | Record<string, any>); // Record<string, any>는 임시

// 탭 설정 타입 (제네릭 T 사용)
interface TabConfig<T extends DataItem> {
  icon?: SvgIconComponent | React.ElementType; // 아이콘 (Optional)
  title: string;
  itemName: string;
  dataField: keyof CVEDetailData | string; // CVE 데이터 객체의 키 또는 문자열
  wsFieldName: string; // 웹소켓 필드명
  defaultItem: T; // 기본 아이템 객체
  emptyTitle: string;
  emptyDescription: string;
  // addButtonText 삭제 -> Add ${itemName} 사용
  // editButtonText 삭제 -> Edit ${itemName} 사용
  // deleteButtonText 삭제 -> Delete 사용
  validateItem?: (item: T) => boolean | string; // 유효성 검사 (결과: boolean 또는 에러 메시지 string)
  checkDuplicate?: (item: T, items: T[], excludeIndex?: number) => boolean; // 중복 검사
  renderItemLabel: (item: T) => ReactNode; // 필수
  renderItemContent?: (item: T) => ReactNode; // Optional
  renderDialogContent: ( // 필수
    item: T,
    updateItemState: <K extends keyof T>(item: T, field: K, value: T[K]) => void, // 제네릭 방식으로 변경
    isEdit: boolean
  ) => ReactNode;
  prepareItemForSave?: (item: Partial<T>, isUpdate: boolean, currentUser?: User | null) => Partial<T> | Record<string, any>; // 사용자 정보 전달
}

// 부모로부터 받는 메시지 전송 함수 타입
type SendMessageFn = (type: string, data: Record<string, unknown>) => void;

// useSocket 훅 반환 타입 (실제 반환 타입에 맞춰야 함)
interface SocketHookReturn {
  socket?: any; // 실제 소켓 객체 타입으로 교체 필요 (e.g., Socket from 'socket.io-client')
  emit: SendMessageFn;
  on: (eventName: string, callback: (data: any) => void) => void;
  off: (eventName: string, callback: (data: any) => void) => void;
  connected: boolean;
}

// 컴포넌트 Props 타입
interface GenericDataTabProps<T extends DataItem> {
  cve: CVEDetailData;
  currentUser?: User | null;
  refreshTrigger: number; // 새로고침 트리거 (필수)
  tabConfig: TabConfig<T>; // 해당 탭의 설정 객체 (필수)
  parentSendMessage?: SendMessageFn; // Optional (useSocket으로 대체 가능성 있음)
  onCountChange?: (count: number) => void; // Optional
}

// API 응답 타입 (예시)
interface CveUpdateResponse {
    data: CVEDetailData; // 응답 데이터 구조 확인 필요
}

// --- 컴포넌트 구현 ---

// 제네릭 타입 T를 사용하여 컴포넌트 정의
const GenericDataTab = memo(<T extends DataItem>(props: GenericDataTabProps<T>) => {
  const {
    cve,
    currentUser,
    refreshTrigger,
    tabConfig,
    // parentSendMessage, // useSocket의 emit으로 대체되었으므로 주석 처리 또는 제거
    onCountChange = () => {}, // 기본값 함수
  } = props;

  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  // --- 상태 관리 ---
  const [loading, setLoading] = useState(false); // 로딩 상태
  const [open, setOpen] = useState(false); // 다이얼로그 열림 상태
  const [newItem, setNewItem] = useState<T>({ ...tabConfig.defaultItem }); // 새 아이템
  const [selectedItem, setSelectedItem] = useState<T & { originalIndex?: number } | null>(null); // 선택된 아이템 (원본 인덱스 포함 가능)
  // const [selectedIndex, setSelectedIndex] = useState<number>(-1); // selectedItem.originalIndex 로 대체 가능
  const [error, setError] = useState<string | null>(null); // 다이얼로그 내 에러 메시지

  // --- Socket 설정 ---
  const { socket, emit, on, off, connected } = useSocket(); // useSocket 훅 사용

  // 데이터 배열 참조 (prop으로 받은 cve 사용)
  // dataField가 string일 수 있으므로 타입 단언 사용 (백엔드 응답 구조에 따라 조정)
  const items: T[] = useMemo(() =>
    (cve && typeof tabConfig.dataField === 'string' && cve[tabConfig.dataField] as T[]) || [],
    [cve, tabConfig.dataField]
  );

  // --- 핸들러 및 콜백 ---

  // 다이얼로그 내 아이템 상태 업데이트 함수 (제네릭 사용)
  const updateItemState = useCallback(<K extends keyof T>(item: T, field: K, value: T[K]) => {
      if (selectedItem) {
          // 선택된 아이템 업데이트 (수정 모드)
          setSelectedItem(prev => prev ? { ...prev, [field]: value } : null);
      } else {
          // 새 아이템 업데이트 (추가 모드)
          setNewItem(prev => ({ ...prev, [field]: value }));
      }
      setError(null); // 입력 변경 시 에러 초기화
  }, [selectedItem]); // 의존성 배열에 selectedItem 추가

  // refreshTrigger 변경 시 캐시 무효화
  useEffect(() => {
    if (refreshTrigger > 0 && cve?.cveId) {
      logger.info(`GenericDataTab (${tabConfig.title}): refreshTrigger 감지, 캐시 무효화`);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cve.cveId) } as InvalidateQueryFilters);
    }
  }, [refreshTrigger, queryClient, cve?.cveId, tabConfig.title]);

  // 아이템 수 변경 시 콜백 호출
  useEffect(() => {
    onCountChange(items.length);
  }, [items.length, onCountChange]);

  // 웹소켓 이벤트 리스너 (데이터 업데이트 수신)
  useEffect(() => {
    if (!connected || !cve?.cveId || !tabConfig.wsFieldName) return;

    const handleDataUpdated = (data: { cveId?: string; field?: string; cve?: CVEDetailData }) => {
      if (data?.cveId === cve.cveId && data?.field === tabConfig.wsFieldName && data?.cve) {
        logger.debug('GenericDataTab', `${tabConfig.itemName} 데이터 업데이트 이벤트 수신`, { cveId: data.cveId, field: data.field });
        // React Query 캐시 직접 업데이트
        queryClient.setQueryData<CVEDetailData>(QUERY_KEYS.CVE.detail(cve.cveId), data.cve);
        // 아이템 수 업데이트 (캐시 업데이트 후 자동으로 반영될 수도 있음, 필요시 호출)
        const updatedItems = (data.cve[tabConfig.dataField as keyof CVEDetailData] as T[]) || [];
        onCountChange(updatedItems.length);
      }
    };

    const eventName = SOCKET_EVENTS.DATA_UPDATED; // 실제 사용하는 이벤트 이름으로 확인/변경 필요
    on(eventName, handleDataUpdated);

    return () => { // 클린업
      off(eventName, handleDataUpdated);
    };
  }, [connected, cve?.cveId, tabConfig.wsFieldName, tabConfig.itemName, tabConfig.dataField, on, off, queryClient, onCountChange]); // tabConfig.dataField 추가

  // 유효성 검사 함수
  const isItemValid = useCallback((item: T): boolean => {
    // 빈 값 체크 등 기본 유효성 추가 가능
    if (!item) return false;
    const validationResult = tabConfig.validateItem ? tabConfig.validateItem(item) : true;
    return typeof validationResult === 'boolean' ? validationResult : false; // boolean 결과만 유효
  }, [tabConfig.validateItem]);

  // 중복 검사 함수
  const isDuplicateItem = useCallback((item: T, excludeIndex: number = -1): boolean => {
    return tabConfig.checkDuplicate ? tabConfig.checkDuplicate(item, items, excludeIndex) : false;
  }, [tabConfig.checkDuplicate, items]); // items 의존성 추가

  // 다이얼로그 버튼 활성화 조건
  const isButtonEnabled = useMemo(() => {
    const itemToCheck = selectedItem ?? newItem;
    if (!isItemValid(itemToCheck)) {
      return false; // 유효하지 않으면 비활성화
    }
    // 수정 시에는 handleUpdateItem에서, 추가 시에는 handleAddItem에서 중복 검사
    return !loading; // 로딩 중 아닐 때 활성화
  }, [selectedItem, newItem, isItemValid, loading]); // isDuplicateItem 제거, loading 추가

  // 추가 버튼 클릭
  const handleAddClick = useCallback(() => {
    setSelectedItem(null);
    setNewItem({ ...tabConfig.defaultItem }); // 항상 defaultItem으로 초기화
    setError(null);
    setOpen(true);
  }, [tabConfig.defaultItem]);

  // 수정 버튼 클릭
  const handleEditClick = useCallback((item: T, index: number) => {
    setSelectedItem({ ...item, originalIndex: index }); // 원본 인덱스 저장
    setError(null);
    setOpen(true);
  }, []);

  // 다이얼로그 닫기
  const handleClose = useCallback(() => {
    // activeElement가 HTMLElement인지 확인 후 blur 호출
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
    setTimeout(() => {
      setOpen(false);
      // 상태 초기화는 다이얼로그가 완전히 닫힌 후 실행될 수 있도록 보장
      setSelectedItem(null);
      setNewItem({ ...tabConfig.defaultItem });
      setError(null); // 에러 상태 초기화
    }, 150); // Fade Transition 시간을 고려하여 약간의 지연 추가 (Material UI 기본값)
  }, [tabConfig.defaultItem]);

  // 데이터 업데이트 성공 처리 (공통 로직)
  const handleUpdateSuccess = useCallback((responseData: CVEDetailData, successMessage: string) => {
      // React Query 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cve.cveId), responseData);

      // 소켓 이벤트 전송 (emit 사용)
      if (connected) {
          emit(SOCKET_EVENTS.DATA_UPDATED, { // 실제 이벤트 이름 사용
              cveId: cve.cveId,
              field: tabConfig.wsFieldName,
              cve: responseData, // 전체 CVE 데이터 전송
          });
      } else {
          logger.warn('[GenericDataTab] Socket not connected, skipping emit.');
      }

      // UI 업데이트 및 알림
      if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
      }
      setTimeout(() => {
          handleClose(); // 다이얼로그 닫기 및 상태 초기화
          enqueueSnackbar(successMessage as SnackbarMessage, { variant: 'success' });
      }, 0); // 즉시 실행하되, call stack 분리

      // 아이템 수 업데이트 (캐시 업데이트로 반영될 수 있으므로 선택적)
      // const updatedItems = (responseData[tabConfig.dataField as keyof CVEDetailData] as T[]) || [];
      // onCountChange(updatedItems.length);

  }, [queryClient, cve.cveId, connected, emit, tabConfig.wsFieldName, handleClose, enqueueSnackbar /*, onCountChange, tabConfig.dataField*/]);

  // API 에러 처리 (공통 로직)
  const handleApiError = useCallback((error: unknown, action: string) => {
    const errorMessage = (error instanceof AxiosError ? error.response?.data?.detail || error.message : (error as Error).message)
                     || `${tabConfig.itemName} ${action} 중 오류가 발생했습니다.`;
    logger.error(`Failed to ${action} ${tabConfig.itemName}:`, error);
    setError(errorMessage); // 다이얼로그 내 에러 표시
    // 스낵바 에러는 간결하게 표시하거나, 다이얼로그 내 에러와 중복되므로 제거 가능
    // enqueueSnackbar(errorMessage as SnackbarMessage, { variant: 'error' });
  }, [tabConfig.itemName]); // setError 추가

  // 아이템 추가 핸들러
  const handleAddItem = useCallback(async () => {
    setError(null); // 이전 에러 초기화

    // 유효성 검사 (버튼 활성화 로직과 별개로 한 번 더 체크)
    if (!isItemValid(newItem)) {
      const validationMessage = typeof tabConfig.validateItem === 'function'
          ? tabConfig.validateItem(newItem) || '입력값을 확인해주세요.' // validateItem이 string 반환 시 사용
          : '입력값을 확인해주세요.';
      setError(validationMessage as string);
      // enqueueSnackbar(validationMessage as SnackbarMessage, { variant: 'warning' }); // 다이얼로그 에러로 대체
      return;
    }
    // 중복 검사
    if (isDuplicateItem(newItem)) {
      setError('이미 존재하는 항목입니다.');
      // enqueueSnackbar('이미 존재하는 항목입니다.', { variant: 'error' }); // 다이얼로그 에러로 대체
      return;
    }

    setLoading(true);

    // 생성자 정보 추가 (기존 로직 유지)
    const newItemWithMeta: Partial<T> = {
      ...newItem,
      created_by: currentUser?.username || 'anonymous',
      // created_at 등 타임스탬프는 prepareItemForSave 또는 백엔드에서 처리
    };

    // 저장용 데이터 준비 (prepareItemForSave 사용)
    const finalItemPayload = tabConfig.prepareItemForSave
      ? tabConfig.prepareItemForSave(newItemWithMeta, false, currentUser)
      : newItemWithMeta;

    // 기존 아이템 배열에 새 아이템 추가 (업데이트할 전체 배열)
    const updatedItems = [...items, finalItemPayload as T]; // 타입 단언 주의

    try {
      const response = await api.patch<CveUpdateResponse>(`/cves/${cve.cveId}`, {
        [tabConfig.dataField as string]: updatedItems,
      }, { skipAuthRefresh: false }); // skipAuthRefresh 명시

      handleUpdateSuccess(response.data.data, `${tabConfig.itemName}이(가) 추가되었습니다.`);

    } catch (error) {
      handleApiError(error, '추가');
      // 낙관적 업데이트 롤백은 React Query가 관리하므로 명시적 롤백 불필요
    } finally {
      setLoading(false);
    }
  }, [
      newItem, items, tabConfig, currentUser, isItemValid, isDuplicateItem, cve.cveId,
      handleUpdateSuccess, handleApiError, // 공통 함수 사용
      // queryClient, emit, enqueueSnackbar, onCountChange, // handleUpdateSuccess/handleApiError로 이동
  ]);

  // 아이템 삭제 핸들러
  const handleDeleteItem = useCallback(async (indexToDelete: number) => {
    // 삭제 확인 다이얼로그 추가 고려
    // if (!window.confirm(`${tabConfig.itemName} 항목을 삭제하시겠습니까?`)) {
    //   return;
    // }

    setLoading(true); // 개별 아이템 로딩 상태는 아직 없으므로 전체 로딩 사용

    const updatedItems = items.filter((_, i) => i !== indexToDelete);

    try {
      const response = await api.patch<CveUpdateResponse>(`/cves/${cve.cveId}`, {
        [tabConfig.dataField as string]: updatedItems,
        // action: 'delete' // 백엔드가 요구하는 경우 추가
      }, { skipAuthRefresh: false });

      // 삭제 성공 시 스낵바 알림 (handleUpdateSuccess는 다이얼로그 닫기가 포함됨)
      enqueueSnackbar(`${tabConfig.itemName}이(가) 삭제되었습니다.`, { variant: 'success' });
      // 캐시 업데이트는 필요 (handleUpdateSuccess와 유사하게)
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cve.cveId), response.data.data);
      // 소켓 이벤트 전송
      if (connected) {
          emit(SOCKET_EVENTS.DATA_UPDATED, {
              cveId: cve.cveId,
              field: tabConfig.wsFieldName,
              cve: response.data.data,
          });
      }
       // 아이템 수 업데이트 (필요시)
       onCountChange(updatedItems.length);


    } catch (error) {
       // 삭제 실패 시 스낵바 알림
      const errorMessage = (error instanceof AxiosError ? error.response?.data?.detail || error.message : (error as Error).message)
                       || `${tabConfig.itemName} 삭제 중 오류가 발생했습니다.`;
      logger.error(`Failed to delete ${tabConfig.itemName}:`, error);
      enqueueSnackbar(errorMessage as SnackbarMessage, { variant: 'error' });
      // 명시적인 롤백 불필요 (React Query 캐시 사용)
    } finally {
      setLoading(false);
    }
  }, [
      items, tabConfig, cve.cveId, queryClient, emit, enqueueSnackbar, connected, onCountChange, // 필요한 의존성 추가
      // handleApiError 삭제 (직접 에러 처리)
  ]);

  // 아이템 수정 핸들러
  const handleUpdateItem = useCallback(async () => {
    if (!selectedItem) return; // 수정할 아이템 없으면 중단

    setError(null); // 이전 에러 초기화

    const itemToUpdate = { ...selectedItem }; // 복사본 사용
    const originalIndex = itemToUpdate.originalIndex; // 원본 인덱스 가져오기
    if (typeof originalIndex !== 'number' || originalIndex < 0) {
        logger.error("Invalid originalIndex for update", selectedItem);
        setError("항목 수정 중 오류가 발생했습니다. (Invalid Index)");
        return;
    }
    delete (itemToUpdate as any).originalIndex; // 내부용 인덱스 제거

    // 유효성 검사
    if (!isItemValid(itemToUpdate as T)) {
      const validationMessage = typeof tabConfig.validateItem === 'function'
          ? tabConfig.validateItem(itemToUpdate as T) || '입력값을 확인해주세요.'
          : '입력값을 확인해주세요.';
      setError(validationMessage as string);
      // enqueueSnackbar(validationMessage as SnackbarMessage, { variant: 'warning' });
      return;
    }
    // 중복 검사 (자기 자신 제외)
    if (isDuplicateItem(itemToUpdate as T, originalIndex)) {
      setError('이미 존재하는 항목입니다.');
      // enqueueSnackbar('이미 존재하는 항목입니다.', { variant: 'error' });
      return;
    }

    setLoading(true);

    // 수정자 정보 추가 (필요시)
    const updatedItemWithMeta: Partial<T> = {
      ...itemToUpdate,
      last_modified_by: currentUser?.username || 'anonymous',
      // last_modified_at은 prepareItemForSave 또는 백엔드에서 처리
    };

    // 저장용 데이터 준비
    const finalItemPayload = tabConfig.prepareItemForSave
      ? tabConfig.prepareItemForSave(updatedItemWithMeta, true, currentUser)
      : updatedItemWithMeta;

    // 업데이트된 아이템 배열 생성
    const updatedItems = items.map((item, i) =>
      i === originalIndex ? (finalItemPayload as T) : item // 타입 단언 주의
    );

    try {
      const response = await api.patch<CveUpdateResponse>(`/cves/${cve.cveId}`, {
        [tabConfig.dataField as string]: updatedItems,
      }, { skipAuthRefresh: false });

      handleUpdateSuccess(response.data.data, `${tabConfig.itemName}이(가) 수정되었습니다.`);

    } catch (error) {
      handleApiError(error, '수정');
      // 롤백은 React Query가 처리
    } finally {
      setLoading(false);
    }
  }, [
      selectedItem, items, tabConfig, currentUser, isItemValid, isDuplicateItem, cve.cveId,
      handleUpdateSuccess, handleApiError, // 공통 함수 사용
      // queryClient, emit, enqueueSnackbar, onCountChange, // handleUpdateSuccess/handleApiError로 이동
  ]);

  // 저장 버튼 클릭 핸들러 (다이얼로그)
  const handleSave = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
    // 비동기 처리하여 blur() 완료 후 실행 보장
    setTimeout(() => {
      if (selectedItem) {
        handleUpdateItem();
      } else {
        handleAddItem();
      }
    }, 0);
  }, [selectedItem, handleUpdateItem, handleAddItem]);

  // --- 렌더링 ---
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <ListHeader> {/* CommonStyles의 ListHeader 사용 (padding, border 등 포함 가정) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* tabConfig.icon이 있으면 렌더링, color="primary" 적용 */}
          {tabConfig.icon && React.createElement(tabConfig.icon, { color: "primary" })}
          <Typography variant="h6" color="text.primary">
            {tabConfig.title} ({items.length}) {/* 아이템 수 표시 */}
          </Typography>
          {/* 로딩 상태 표시 */}
          {/* 헤더 전체 로딩보다 버튼 로딩이 더 적합할 수 있음 */}
          {/* {loading && <CircularProgress size={20} sx={{ ml: 1 }} />} */}
        </Box>
        {/* 추가 버튼 - ActionButton 사용 */}
        <ActionButton
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
          disabled={loading} // 전체 로딩 상태에 따라 비활성화
        >
          {`Add ${tabConfig.itemName}`} {/* 기존 텍스트 형식 사용 */}
        </ActionButton>
      </ListHeader>

      {/* 컨텐츠 영역 */}
      {items.length === 0 ? (
        // 아이템 없을 때 빈 상태 화면 - EmptyState 사용
        <EmptyState>
          {/* 아이콘 스타일 원본 적용 */}
          {tabConfig.icon && React.createElement(tabConfig.icon, {
            sx: { fontSize: 48, color: 'primary.main', opacity: 0.7 }
          })}
          <Typography variant="h6" gutterBottom /* sx={{ mt: 1 }} 제거 */>
            {tabConfig.emptyTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" /* sx={{ mb: 2 }} 제거 */>
            {tabConfig.emptyDescription}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
            disabled={loading}
            sx={{ mt: 2 }} // 원본 스타일 적용
          >
            {`Add First ${tabConfig.itemName}`} {/* 기존 텍스트 형식 사용 */}
          </Button>
        </EmptyState>
      ) : (
        // 아이템 목록
        <Box sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2, // 좌우 패딩
          py: 1, // 상하 패딩
          '& > *:not(:last-child)': { mb: 2 } // 아이템 간 간격 원본 적용 (mb: 2)
        }}>
          {items.map((item, index) => (
            <StyledListItem key={item.id ?? `item-${index}`} elevation={0}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* 상단: 라벨 및 액션 버튼 */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  {/* 좌측: 라벨 */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mr: 1 }}>
                    {tabConfig.renderItemLabel(item)}
                  </Box>
                  {/* 우측: 액션 버튼 */}
                  <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                    {/* URL 열기 버튼 (item.url이 있을 때만) */}
                    {('url' in item && item.url) && (
                      <Tooltip title="Open URL">
                        {/* <a> 태그로 ActionIconButton을 감쌉니다. */}
                        <a
                          href={(item.url as string).startsWith('http') ? (item.url as string) : `https://${item.url as string}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none', color: 'inherit' }} // 링크 밑줄 제거 및 아이콘 색상 상속
                          aria-label={`Open URL for ${tabConfig.renderItemLabel(item)}`} // 접근성 향상
                        >
                          <ActionIconButton
                            size="small"
                            disabled={loading}
                            // component, href, target, rel 속성 제거
                          >
                            <LaunchIcon fontSize="small" />
                          </ActionIconButton>
                        </a>
                      </Tooltip>
                    )}
                    {/* 수정 버튼 */}
                    <Tooltip title="Edit">
                      <ActionIconButton size="small" onClick={() => handleEditClick(item, index)} disabled={loading}>
                        <EditIcon fontSize="small" />
                      </ActionIconButton>
                    </Tooltip>
                    {/* 삭제 버튼 */}
                    <Tooltip title="Delete">
                      <ActionIconButton size="small" color="error" onClick={() => handleDeleteItem(index)} disabled={loading}>
                        <DeleteIcon fontSize="small" />
                      </ActionIconButton>
                    </Tooltip>
                  </Box>
                </Box>

                {/* 설명 (있을 경우) */}
                {item.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      pl: 2,
                      borderLeft: '2px solid',
                      borderColor: 'divider',
                      wordBreak: 'break-word'
                    }}
                  >
                    {item.description}
                  </Typography>
                )}

                {/* 추가 컨텐츠 (설정된 경우) */}
                {tabConfig.renderItemContent && (
                    <Box sx={{ mt: 0.5 }}>{tabConfig.renderItemContent(item)}</Box>
                )}

                {/* 하단: 메타 정보 */}
                { (item.created_by || item.created_at) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      {item.created_by && (
                          <Typography variant="caption" color="text.secondary">
                              Added by {item.created_by}
                          </Typography>
                      )}
                      {item.created_by && item.created_at && (
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: '1' }}>•</Typography>
                      )}
                      {item.created_at && (
                          <Tooltip title={`Created at: ${new Date(item.created_at).toLocaleString()}`}>
                              <Typography variant="caption" color="text.secondary">
                                  {formatDateTime(item.created_at)}
                              </Typography>
                          </Tooltip>
                      )}
                    </Box>
                )}
              </Box>
            </StyledListItem>
          ))}
        </Box>
      )}

      {/* 추가/수정 다이얼로그 */}
      <Dialog
        open={open}
        onClose={handleClose} // onClose 핸들러 사용
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade} // Fade 트랜지션 사용
        PaperProps={{ sx: { borderRadius: 3 } }} // 원본 borderRadius 적용
        keepMounted={false} // 필요시 false로 설정하여 성능 최적화
        disableRestoreFocus={false} // 원본 설정 유지
        disableEnforceFocus={false} // 원본 설정 유지
        disableAutoFocus={false} // 원본 설정 유지
        disablePortal={false} // 원본 설정 유지
        aria-labelledby="generic-dialog-title"
      >
        <DialogTitle id="generic-dialog-title">
          {/* 기존 텍스트 형식 사용 */}
          {selectedItem ? `Edit ${tabConfig.itemName}` : `Add ${tabConfig.itemName}`}
        </DialogTitle>
        <DialogContent dividers /* 컨텐츠 구분선 추가 (유지) */>
          {/* 다이얼로그 컨텐츠 렌더링 (아이템과 업데이트 함수 전달) */}
          {tabConfig.renderDialogContent(
            selectedItem ?? newItem, // 수정 중이면 selectedItem, 아니면 newItem
            updateItemState, // 업데이트 함수 전달
            selectedItem !== null // 수정 모드 여부 전달
          )}
          {/* 에러 메시지 표시 (다이얼로그 하단) */}
          {error && <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>{error}</Typography>}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }} /* 패딩 유지 */>
          <Button onClick={handleClose} color="inherit" /* 색상 유지 */>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isButtonEnabled || loading} // 로딩 중일 때도 비활성화
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined} // 로딩 아이콘 유지
            autoFocus={true} // 원본 autoFocus 적용
          >
            {/* 기존 텍스트 형식 사용 */}
            {selectedItem ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}); // memo 끝

GenericDataTab.displayName = 'GenericDataTab'; // DevTools 이름 설정
export default GenericDataTab;