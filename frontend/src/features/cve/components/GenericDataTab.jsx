import React, { useState, useEffect, memo } from 'react';
import {
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Fade,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Launch as LaunchIcon
} from '@mui/icons-material';
import {
  StyledListItem,
  ActionButton,
  ActionIconButton,
  ListHeader,
  ChipLabel,
  EmptyState
} from './CommonStyles';
import { useDispatch } from 'react-redux';
import { 
  updateCVEDetail,
  fetchCVEDetail
} from '../../../store/slices/cveSlice';
import { WS_EVENT_TYPE } from '../../../services/websocket';
import { useSnackbar } from 'notistack';

/**
 * 재사용 가능한 데이터 탭 컴포넌트
 */
const GenericDataTab = memo(({
  // 필수 속성
  cve,                          // CVE 데이터
  currentUser,                  // 현재 사용자
  refreshTrigger,               // 새로고침 트리거
  tabConfig,                    // 탭 구성 설정
  sendMessage,                  // 메시지 전송 함수 (상위 컴포넌트에서 전달)

  // 선택적 속성 (기본값 설정)
  onCountChange = () => {}      // 항목 수가 변경될 때 호출되는 콜백
}) => {
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [newItem, setNewItem] = useState(tabConfig.defaultItem);

  // 데이터 배열 참조
  const items = cve[tabConfig.dataField] || [];

  // 아이템 세부 정보 업데이트 처리
  const updateItemState = (item, field, value) => {
    if (selectedItem) {
      setSelectedItem({ ...selectedItem, [field]: value });
    } else {
      setNewItem({ ...newItem, [field]: value });
    }
  };

  // refreshTrigger가 변경될 때마다 데이터 새로고침
  useEffect(() => {
    if (refreshTrigger > 0) {
      dispatch(fetchCVEDetail(cve.cveId));
    }
  }, [refreshTrigger, dispatch, cve?.cveId]);

  // 아이템 수 변경 시 상위 컴포넌트에 알림
  useEffect(() => {
    onCountChange?.(items.length);
  }, [items.length, onCountChange]);

  // URL 유효성 검사 함수 (tabConfig에서 유효성 검사 함수를 제공하지 않으면 기본값 사용)
  const isItemValid = (item) => {
    return tabConfig.validateItem ? tabConfig.validateItem(item) : true;
  };

  // URL 중복 검사 함수 (tabConfig에서 중복 검사 함수를 제공하지 않으면 기본값 사용)
  const isDuplicateItem = (item, excludeIndex = -1) => {
    return tabConfig.checkDuplicate ? 
      tabConfig.checkDuplicate(item, items, excludeIndex) : 
      false;
  };

  // 버튼 활성화 여부
  const isButtonEnabled = selectedItem ? 
    isItemValid(selectedItem) && !loading : 
    isItemValid(newItem) && !loading;

  // 추가 버튼 클릭 핸들러
  const handleAddClick = () => {
    setSelectedItem(null);
    setNewItem(tabConfig.defaultItem);
    setOpen(true);
  };

  // 수정 버튼 클릭 핸들러
  const handleEditClick = (item, index) => {
    setSelectedItem({ ...item, id: index });
    setOpen(true);
  };

  // 다이얼로그 닫기 핸들러
  const handleClose = () => {
    // 다이얼로그 닫기 전에 포커스 해제
    document.activeElement?.blur();
    
    // setTimeout으로 비동기 처리하여 포커스 충돌 방지
    setTimeout(() => {
      setOpen(false);
      setSelectedItem(null);
      setNewItem(tabConfig.defaultItem);
    }, 0);
  };

  // 아이템 추가 핸들러
  const handleAddItem = async () => {
    try {
      // 중복 검사 (필요시)
      if (tabConfig.checkDuplicate && isDuplicateItem(newItem)) {
        enqueueSnackbar('이미 존재하는 항목입니다.', {
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        return;
      }

      setLoading(true);
      setError(null);

      // KST 시간으로 생성
      const kstTime = new Date();
      kstTime.setHours(kstTime.getHours() + 9);  // UTC+9 (KST)
      
      // 새로운 아이템 객체 생성
      const newItemWithMetadata = {
        ...newItem,
        dateAdded: kstTime.toISOString(),  // KST 시간을 ISO 문자열로 변환
        addedBy: currentUser?.username || 'anonymous'
      };

      // 추가적인 메타데이터 처리 (있다면)
      const finalItem = tabConfig.prepareItemForSave ? 
        tabConfig.prepareItemForSave(newItemWithMetadata, false) : 
        newItemWithMetadata;

      const updatedItems = [...items, finalItem];
      
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { [tabConfig.dataField]: updatedItems }
      })).unwrap();

      if (response) {
        // WebSocket 메시지 전송 - 필드 정보 추가
        await sendMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            field: tabConfig.wsFieldName,
            cve: response.data
          }
        );
        
        // 포커스 해제 후 상태 업데이트
        document.activeElement?.blur();
        setTimeout(() => {
          setOpen(false);
          setNewItem(tabConfig.defaultItem);
          
          // 성공 메시지 표시
          enqueueSnackbar(`${tabConfig.itemName}이(가) 추가되었습니다.`, { variant: 'success' });
        }, 0);
      }
    } catch (error) {
      console.error(`Failed to add ${tabConfig.itemName}:`, error);
      enqueueSnackbar(error.message || `${tabConfig.itemName} 추가 중 오류가 발생했습니다.`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 아이템 삭제 핸들러
  const handleDeleteItem = async (index) => {
    try {
      setLoading(true);
      setError(null);

      // 기존 아이템 배열에서 해당 인덱스만 제외
      const updatedItems = items.filter((_, i) => i !== index);

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { [tabConfig.dataField]: updatedItems }
      })).unwrap();

      if (response) {
        // WebSocket 메시지 전송 - 필드 정보 추가
        await sendMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            field: tabConfig.wsFieldName,
            cve: response.data
          }
        );
        
        enqueueSnackbar(`${tabConfig.itemName}이(가) 삭제되었습니다.`, { variant: 'success' });
      }
    } catch (error) {
      console.error(`Failed to delete ${tabConfig.itemName}:`, error);
      enqueueSnackbar(error.message || `${tabConfig.itemName} 삭제 중 오류가 발생했습니다.`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 아이템 수정 핸들러
  const handleUpdateItem = async () => {
    if (!selectedItem) return;

    try {
      // 중복 검사 (필요시)
      if (tabConfig.checkDuplicate && isDuplicateItem(selectedItem, selectedItem.id)) {
        enqueueSnackbar('이미 존재하는 항목입니다.', {
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        return;
      }

      setLoading(true);
      setError(null);

      // KST 시간으로 업데이트
      const kstTime = new Date();
      kstTime.setHours(kstTime.getHours() + 9);  // UTC+9 (KST)
      
      // 업데이트할 아이템 준비 (기존 메타데이터 유지)
      const updatedItemData = { ...selectedItem };
      delete updatedItemData.id; // id는 내부 식별자이므로 제거
      
      // 추가적인 메타데이터 처리 (있다면)
      const finalItem = tabConfig.prepareItemForSave ? 
        tabConfig.prepareItemForSave(updatedItemData, true, kstTime) : 
        updatedItemData;

      // 기존 아이템 배열을 복사하고 선택된 인덱스의 데이터만 업데이트
      const updatedItems = items.map((item, index) =>
        index === selectedItem.id ? finalItem : item
      );

      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { [tabConfig.dataField]: updatedItems }
      })).unwrap();

      if (response) {
        // WebSocket 메시지 전송 - 필드 정보 추가
        await sendMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId: cve.cveId,
            field: tabConfig.wsFieldName,
            cve: response.data
          }
        );
        
        // 포커스 해제 후 상태 업데이트
        document.activeElement?.blur();
        setTimeout(() => {
          enqueueSnackbar(`${tabConfig.itemName}이(가) 수정되었습니다.`, { variant: 'success' });
          setOpen(false);
          setSelectedItem(null);
        }, 0);
      }
    } catch (error) {
      console.error(`[${tabConfig.itemName}Tab] Error in handleUpdateItem:`, error);
      enqueueSnackbar(error.message || `${tabConfig.itemName} 수정 중 오류가 발생했습니다.`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 저장 버튼 클릭 핸들러
  const handleSave = () => {
    // 포커스 해제
    document.activeElement?.blur();
    
    // 버튼 처리를 비동기로 수행
    setTimeout(() => {
      if (selectedItem) {
        handleUpdateItem();
      } else {
        handleAddItem();
      }
    }, 0);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ListHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {tabConfig.icon && React.createElement(tabConfig.icon, { color: "primary" })}
          <Typography variant="h6" color="text.primary">
            {tabConfig.title} ({items.length || 0})
          </Typography>
        </Box>
        <ActionButton
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
        >
          {`Add ${tabConfig.itemName}`}
        </ActionButton>
      </ListHeader>

      {(!items || items.length === 0) ? (
        <EmptyState>
          {tabConfig.icon && React.createElement(tabConfig.icon, { 
            sx: { fontSize: 48, color: 'primary.main', opacity: 0.7 } 
          })}
          <Typography variant="h6" gutterBottom>
            {tabConfig.emptyTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tabConfig.emptyDescription}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
            sx={{ mt: 2 }}
          >
            {`Add First ${tabConfig.itemName}`}
          </Button>
        </EmptyState>
      ) : (
        <Box sx={{ 
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 1,
          '& > *:not(:last-child)': { mb: 2 }
        }}>
          {items.map((item, index) => (
            <StyledListItem key={index} elevation={1}>
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: 1
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {tabConfig.renderItemLabel(item)}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {item.url && (
                      <Tooltip title="Open URL">
                        <ActionIconButton
                          size="small"
                          component="a"
                          href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <LaunchIcon />
                        </ActionIconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit">
                      <ActionIconButton 
                        size="small" 
                        onClick={() => handleEditClick(item, index)}
                      >
                        <EditIcon />
                      </ActionIconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <ActionIconButton 
                        size="small"
                        color="error"
                        onClick={() => handleDeleteItem(index)}
                      >
                        <DeleteIcon />
                      </ActionIconButton>
                    </Tooltip>
                  </Box>
                </Box>
                {item.description && (
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ 
                      pl: 2,
                      borderLeft: '2px solid',
                      borderColor: 'divider'
                    }}
                  >
                    {item.description}
                  </Typography>
                )}
                {tabConfig.renderItemContent && tabConfig.renderItemContent(item)}
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: 1,
                  mt: 0.5
                }}>
                  <Typography variant="caption" color="text.secondary">
                    Added by {item.addedBy}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    •
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(item.dateAdded).toLocaleString('ko-KR', { 
                      timeZone: 'Asia/Seoul'
                    })}
                  </Typography>
                </Box>
              </Box>
            </StyledListItem>
          ))}
        </Box>
      )}

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
        PaperProps={{
          sx: {
            borderRadius: 3
          }
        }}
        keepMounted={false}
        disableRestoreFocus={false}
        disableEnforceFocus={false}
        disableAutoFocus={false}
        disablePortal={false}
        aria-labelledby="generic-dialog-title"
      >
        <DialogTitle id="generic-dialog-title">
          {selectedItem ? `Edit ${tabConfig.itemName}` : `Add ${tabConfig.itemName}`}
        </DialogTitle>
        <DialogContent>
          {tabConfig.renderDialogContent(
            selectedItem || newItem, 
            updateItemState,
            selectedItem !== null
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isButtonEnabled}
            autoFocus={true}
          >
            {selectedItem ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}, (prevProps, nextProps) => {
  // 비교 로직
  const itemsChanged = JSON.stringify(prevProps.cve[prevProps.tabConfig.dataField]) !== 
                        JSON.stringify(nextProps.cve[nextProps.tabConfig.dataField]);
  
  if (itemsChanged) {
    return false; // 변경되었으므로 리렌더링 필요
  }
  
  // 그 외의 경우 기존 로직 유지
  return prevProps.refreshTrigger === nextProps.refreshTrigger &&
         prevProps.cve.cveId === nextProps.cve.cveId &&
         prevProps.currentUser?.id === nextProps.currentUser?.id;
});

export default GenericDataTab; 