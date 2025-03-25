// CrawlerUpdateButton.tsx

import React, {
    useState,
    useEffect,
    useCallback,
    useRef,
    MouseEvent
  } from 'react';
  import { useSnackbar } from 'notistack';
  import {
    Button,
    Menu,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    Typography,
    Box,
    LinearProgress,
    IconButton,
    Tooltip,
    Divider,
    Paper,
    CircularProgress,
    Stepper,
    Step,
    StepLabel,
    Card,
    Grid,
    Avatar
  } from '@mui/material';
  import {
    CloudDownload as CloudDownloadIcon,
    Close as CloseIcon,
    Error as ErrorIcon,
    Settings as SettingsIcon,
    DataObject as DataObjectIcon,
    Storage as StorageIcon,
    CheckCircle as CheckCircleIcon,
    Update as UpdateIcon,
    KeyboardArrowDown as ArrowDownIcon,
    InfoOutlined as InfoIcon
  } from '@mui/icons-material';
  import { useQueryClient } from '@tanstack/react-query';
  import api from '../../../api/config/axios';
  import { useSocketIO } from '../../../contexts/SocketIOContext';
  import { formatDistance } from 'date-fns';
  import { ko } from 'date-fns/locale';
  import logger, { LOG_LEVEL } from '../../../utils/logging';
  import { SOCKET_EVENTS, SOCKET_STATE } from '../../../services/socketio/constants';
  import useWebSocketHook from '../../../api/hooks/useWebSocketHook';
  
  // 타입 import
  import { CVEBase, CVEDetail } from '../../../types/cve';
  import { CrawlerUpdateData } from '../../../types/socket';
  import { 
    Crawler, 
    ProgressState, 
    UpdatedCVEs, 
    CrawlerStatusResponse, 
    StageInfo,
    ConnectionStateChangeData 
  } from '../../../types/crawler';
  
  // -----------------------------------------------------------
  
  // 개발 환경에서 디버그 로깅
  if (process.env.NODE_ENV === 'development') {
    logger.setLogLevel(LOG_LEVEL.DEBUG);
    logger.setEnabled(true);
    logger.info('CrawlerUpdateButton', '로그 레벨 설정됨', { level: 'DEBUG', enabled: true });
  }
  
  // 크롤러 진행 단계 정의
  const CRAWLER_STAGES: StageInfo[] = [
    {
      key: 'preparing',
      label: '준비 중',
      description: '크롤러 초기화 및 저장소 연결 준비',
      icon: <SettingsIcon fontSize="small" />,
      color: '#3f51b5',
      backendValues: ['준비 중', '준비', '초기화', '연결', '진행 중']
    },
    {
      key: 'fetching',
      label: '데이터 수집',
      description: '소스에서 데이터 수집 중',
      icon: <CloudDownloadIcon fontSize="small" />,
      color: '#2196f3',
      backendValues: ['데이터 수집', '수집', '진행 중']
    },
    {
      key: 'processing',
      label: '데이터 처리',
      description: '수집된 데이터 처리 및 분석',
      icon: <DataObjectIcon fontSize="small" />,
      color: '#00bcd4',
      backendValues: ['데이터 처리', '처리', '진행 중']
    },
    {
      key: 'saving',
      label: '저장 중',
      description: '처리된 데이터 데이터베이스에 저장',
      icon: <StorageIcon fontSize="small" />,
      color: '#009688',
      backendValues: ['저장 중', '저장', '데이터베이스 업데이트', '업데이트', '진행 중']
    },
    {
      key: 'completed',
      label: '완료',
      description: '크롤링 작업 완료',
      icon: <CheckCircleIcon fontSize="small" />,
      color: '#4caf50',
      backendValues: ['완료', 'done', 'complete', 'finished', 'completed']
    },
    {
      key: 'error',
      label: '오류',
      description: '크롤링 작업 중 오류 발생',
      icon: <ErrorIcon fontSize="small" />,
      color: '#f44336',
      backendValues: ['오류', 'error', '실패', 'failed']
    }
  ];
  
  /**
   * 단계 인덱스 추출 함수
   * @param stageName - 백엔드 또는 프론트에서 전달받은 단계명
   * @returns {number} 해당하는 인덱스
   */
  const getStageIndex = (stageName: string | undefined): number => {
    if (!stageName) {
      console.log(
        '%c 🔍 단계 이름 없음',
        'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;',
        '기본값 0 반환'
      );
      return 0;
    }
  
    const lowerStageName = String(stageName).toLowerCase().trim();
    console.log(
      '%c 🔍 단계 매핑 시도',
      'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;',
      { stageName: lowerStageName }
    );
  
    // 1. 키 매칭
    const stageIndex = CRAWLER_STAGES.findIndex((stage) => stage.key === lowerStageName);
    if (stageIndex >= 0) {
      console.log(
        '%c 🔍 키 매칭 성공',
        'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;',
        {
          stageName: lowerStageName,
          matchedKey: CRAWLER_STAGES[stageIndex].key,
          matchedStage: CRAWLER_STAGES[stageIndex].label,
          index: stageIndex
        }
      );
      return stageIndex;
    }
  
    // 2. 백엔드 값 매칭
    for (let i = 0; i < CRAWLER_STAGES.length; i++) {
      const stage = CRAWLER_STAGES[i];
      if (
        stage.backendValues &&
        stage.backendValues.some(
          (value) =>
            value.toLowerCase() === lowerStageName ||
            lowerStageName.includes(value.toLowerCase()) ||
            value.toLowerCase().includes(lowerStageName)
        )
      ) {
        console.log(
          '%c 🔍 백엔드 값 매칭 성공',
          'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;',
          {
            stageName: lowerStageName,
            matchedStage: stage.label,
            index: i
          }
        );
        return i;
      }
    }
  
    console.log(
      '%c 🔍 매칭 실패',
      'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;',
      {
        stageName: lowerStageName,
        defaultStage: CRAWLER_STAGES[0].label,
        index: 0
      }
    );
    return 0; // 준비 중 반환
  };
  
  /**
   * CrawlerUpdateButton 컴포넌트
   */
  const CrawlerUpdateButton: React.FC = () => {
    const { enqueueSnackbar } = useSnackbar();
    const queryClient = useQueryClient();
    const socketIO = useSocketIO();
  
    // 메뉴 상태
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedCrawler, setSelectedCrawler] = useState<Crawler | null>(null);
  
    // 다이얼로그 열림/닫힘
    const [progressOpen, setProgressOpen] = useState<boolean>(false);
  
    // 진행 상태
    const [progress, setProgress] = useState<ProgressState>({
      stage: '',
      percent: 0,
      message: ''
    });
  
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [lastUpdate, setLastUpdate] = useState<Record<string, unknown>>({});
    const [updatedCVEs, setUpdatedCVEs] = useState<UpdatedCVEs | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [activeStep, setActiveStep] = useState<number>(0);
    const [hasError, setHasError] = useState<boolean>(false);
    const [pollTimer, setPollTimer] = useState<NodeJS.Timeout | null>(null);
    const [lastWebSocketUpdate, setLastWebSocketUpdate] = useState<Date | null>(null);
  
    // 소켓 연결 상태
    const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);
    const prevSocketConnectedRef = useRef<boolean | null>(null);
  
    // 버튼 및 다이얼로그 참조
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const dialogRef = useRef<HTMLDivElement | null>(null);
  
    /** 크롤러 목록 */
    const CRAWLERS: Crawler[] = [
      { id: 'nuclei', name: 'Nuclei Templates', type: 'nuclei' },
      { id: 'metasploit', name: 'Metasploit', type: 'metasploit' },
      { id: 'emerging_threats', name: 'EmergingThreats Rules', type: 'emerging_threats' }
    ];
  
    // ---- API 로직 ------------------------------------------------
  
    // 크롤러 상태 로드
    const loadCrawlerStatus = useCallback(async (): Promise<void> => {
      try {
        setLoading(true);
        const response = await api.get<CrawlerStatusResponse>('/crawler/status');
        const statusData = response.data;
        logger.info('크롤러 상태 로드', statusData);
  
        setIsRunning(statusData.isRunning);
  
        // 단계 정보
        if (statusData.currentStatus) {
          const currentStatus = statusData.currentStatus;
          if (typeof currentStatus.stage === 'string') {
            const stageIndex = getStageIndex(currentStatus.stage);
            setActiveStep(stageIndex);
          }
          setProgress((prev) => ({
            stage:
              currentStatus.stage_label ||
              (currentStatus.stage && CRAWLER_STAGES[getStageIndex(currentStatus.stage)]?.label) ||
              currentStatus.stage ||
              CRAWLER_STAGES[0].label,
            percent: typeof currentStatus.percent === 'number' ? currentStatus.percent : 0,
            message: currentStatus.message || ''
          }));
        }
  
        // 크롤러별 마지막 업데이트 시간
        const newLastUpdate: Record<string, unknown> = {};
        if (statusData.results) {
          Object.keys(statusData.results).forEach((crawlerType) => {
            const crawler = CRAWLERS.find((c) => c.type === crawlerType);
            if (crawler) {
              newLastUpdate[crawler.id] = statusData.lastUpdate;
            }
          });
        }
        // 나머지 크롤러는 기본값
        CRAWLERS.forEach((crawler) => {
          if (!newLastUpdate[crawler.id]) {
            newLastUpdate[crawler.id] = null;
          }
        });
        // 전체 시스템 마지막 업데이트
        newLastUpdate['default'] = statusData.lastUpdate;
        setLastUpdate(newLastUpdate);
      } catch (error) {
        logger.error('크롤러', '상태 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    }, []);
  
    // ---- 폴링 -----------------------------------------------------
  
    const stopPolling = useCallback(() => {
      if (pollTimer) {
        logger.info('폴링 중지');
        clearInterval(pollTimer);
        setPollTimer(null);
      }
    }, [pollTimer]);
  
    const startPolling = useCallback(() => {
      // 이미 폴링 중이면 중지 후 다시 시작
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      logger.info('폴링 시작');
  
      try {
        const timer = setInterval(async () => {
          try {
            if (!isRunning) {
              stopPolling();
              return;
            }
            await loadCrawlerStatus();
          } catch (error) {
            logger.error('폴링', '크롤러 상태 조회 실패:', error);
          }
        }, 3000);
        setPollTimer(timer);
      } catch (error) {
        logger.error('폴링', '타이머 설정 실패:', error);
      }
    }, [pollTimer, isRunning, loadCrawlerStatus, stopPolling]);
  
    // ---- 웹소켓 ---------------------------------------------------
  
    // 소켓 연결 상태 감시 (최적화된 버전)
    useEffect(() => {
      // 초기 상태 설정 (최초 1회만)
      if (prevSocketConnectedRef.current === null) {
        setIsSocketConnected(socketIO.connected);
        prevSocketConnectedRef.current = socketIO.connected;
      }

      const handleConnectionStateChange = (data: ConnectionStateChangeData) => {
        const newConnState = data.state === SOCKET_STATE.CONNECTED;
        
        // 이전 상태와 다를 때만 업데이트 (중요!)
        if (prevSocketConnectedRef.current !== newConnState) {
          if (process.env.NODE_ENV === 'development') {
            logger.debug('CrawlerUpdateButton', '연결 상태 변경됨', {
              state: data.state,
              isConnected: newConnState,
              previous: prevSocketConnectedRef.current
            });
          }
          
          prevSocketConnectedRef.current = newConnState;
          setIsSocketConnected(newConnState);
        }
      };

      const unsubscribe = socketIO.subscribeEvent(
        SOCKET_EVENTS.CONNECTION_STATE_CHANGE,
        handleConnectionStateChange
      );

      return () => {
        unsubscribe();
      };
    }, [socketIO]);
  
    // 크롤러 업데이트 웹소켓 이벤트
    const handleCrawlerUpdateEvent = useCallback(
      (data: CrawlerUpdateData) => {
        logger.info('CrawlerUpdateButton', '크롤러 업데이트 이벤트 수신', {
          eventType: SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS,
          stage: data?.stage,
          percent: data?.percent
        });
  
        // 데이터 처리 함수
        // (아래처럼 간단 처리하거나, processWebSocketData 같은 헬퍼 사용)
        try {
          if (typeof data.stage === 'string') {
            const index = getStageIndex(data.stage);
            setActiveStep(index);
          }
  
          setProgress((prev) => ({
            ...prev,
            stage: data.stage_label ||
              (data.stage && CRAWLER_STAGES[getStageIndex(data.stage)]?.label) ||
              data.stage ||
              '',
            percent: typeof data.percent === 'number' ? data.percent : prev.percent,
            message: data.message || prev.message
          }));
  
          // 완료 / 오류 상태 판단
          const stageValue = String(data.stage).toLowerCase();
          const isCompleted = CRAWLER_STAGES.find((st) => st.key === 'completed')?.backendValues.some((val) =>
            stageValue.includes(val.toLowerCase())
          );
          const isError = CRAWLER_STAGES.find((st) => st.key === 'error')?.backendValues.some((val) =>
            stageValue.includes(val.toLowerCase())
          );
  
          if (isError) {
            setHasError(true);
            setIsRunning(false);
          } else if (isCompleted) {
            setHasError(false);
            setIsRunning(false);
            setProgress((prev) => ({ ...prev, message: '작업이 완료되었습니다.' }));
            enqueueSnackbar('크롤러 작업이 완료되었습니다. CVE 목록을 갱신합니다.', {
              variant: 'success',
              autoHideDuration: 4000
            });
            queryClient.invalidateQueries({ queryKey: ['cves'] });
          } else {
            setHasError(false);
            setIsRunning(true);
          }
  
          // 마지막 업데이트 시간
          setLastUpdate((prev) => ({ ...prev, default: new Date().toISOString() }));
          setLastWebSocketUpdate(new Date());
        } catch (err) {
          logger.error('handleCrawlerUpdateEvent', '데이터 처리 중 오류', err);
        }
      },
      [enqueueSnackbar, queryClient]
    );
  
    // 웹소켓 훅
    useWebSocketHook(SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS, handleCrawlerUpdateEvent, {
      optimisticUpdate: false,
      queryKey: ['crawler', 'status'], 
      updateDataFn: (oldData: any, newData: CrawlerUpdateData) => {
        // 낙관적 업데이트는 사용하지 않지만 함수 시그니처를 맞추기 위해 빈 함수 제공
        return oldData; 
      }
    });
  
    // 소켓 연결/해제 -> 폴링 제어
    useEffect(() => {
      if (isRunning) {
        if (!isSocketConnected) {
          if (!pollTimer) {
            logger.info('CrawlerUpdateButton', '웹소켓 연결 없음 - 폴링 시작');
            startPolling();
          }
        } else if (lastWebSocketUpdate) {
          // 웹소켓이 살아있고 이벤트가 수신되었다면 폴링 중지
          if (pollTimer) {
            logger.info('CrawlerUpdateButton', '웹소켓 연결 복구됨 - 폴링 중지');
            stopPolling();
          }
        }
      } else if (pollTimer) {
        logger.info('CrawlerUpdateButton', '크롤러 실행 중지됨 - 폴링 중지');
        stopPolling();
      }
  
      return () => {
        if (pollTimer) {
          logger.info('CrawlerUpdateButton', '컴포넌트 언마운트 - 폴링 중지');
          stopPolling();
        }
      };
    }, [isSocketConnected, isRunning, pollTimer, lastWebSocketUpdate, startPolling, stopPolling]);
  
    // 초기 상태 로드
    useEffect(() => {
      const timer = setTimeout(() => {
        loadCrawlerStatus();
      }, 500);
      return () => clearTimeout(timer);
    }, [loadCrawlerStatus]);
  
    // ---- UI 이벤트 ------------------------------------------------
  
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
    };
  
    const handleClose = () => {
      setAnchorEl(null);
    };
  
    const handleSelect = (crawler: Crawler) => {
      setSelectedCrawler(crawler);
      setAnchorEl(null);
      runCrawler(crawler);
    };
  
    const runCrawler = async (crawler: Crawler) => {
      try {
        setSelectedCrawler(crawler);
        setProgressOpen(true);
        setProgress({ stage: '준비 중', percent: 0, message: '크롤러 초기화 중...' });
        setActiveStep(0);
        setHasError(false);
        setUpdatedCVEs(null);
  
        await api.post(`/crawler/run/${crawler.type}`, { id: crawler.id });
        startPolling();
      } catch (error: any) {
        logger.error('크롤러', '실행 오류:', error);
        setHasError(true);
        const errorMessage = error.response?.data?.detail || '크롤러 실행 중 오류가 발생했습니다.';
        setProgress({
          stage: '오류',
          percent: 0,
          message: errorMessage
        });
        enqueueSnackbar(errorMessage, {
          variant: 'error',
          autoHideDuration: 5000
        });
      }
    };
  
    // 마지막 업데이트 포맷팅
    const formatLastUpdate = (lastUpdateObj: unknown): string => {
      if (!lastUpdateObj) return '없음';
      try {
        if (typeof lastUpdateObj === 'string') {
          const date = new Date(lastUpdateObj);
          return formatDistance(date, new Date(), { addSuffix: true, locale: ko });
        }
        if (typeof lastUpdateObj === 'object' && lastUpdateObj !== null) {
          const obj = lastUpdateObj as Record<string, any>;
          const dateString = obj.datetime || obj.date || obj.timestamp;
          if (dateString) {
            const date = new Date(dateString);
            return formatDistance(date, new Date(), { addSuffix: true, locale: ko });
          }
        }
        return '없음';
      } catch (e) {
        console.error('날짜 포맷팅 오류:', e);
        return '알 수 없음';
      }
    };
  
    const handleCloseDialog = useCallback(() => {
      if (isRunning) return;
      if (buttonRef.current) {
        buttonRef.current.focus();
      }
      setTimeout(() => {
        setProgressOpen(false);
      }, 10);
    }, [isRunning]);
  
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && progressOpen && !isRunning) {
          handleCloseDialog();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [progressOpen, isRunning, handleCloseDialog]);
  
    // ---- 렌더링 ---------------------------------------------------
  
    return (
      <>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleClick}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <UpdateIcon />}
            endIcon={<ArrowDownIcon />}
            disabled={isRunning || loading}
            sx={{
              mr: 1,
              borderRadius: '30px',
              boxShadow: 'none',
              '&:hover': { boxShadow: 'none', backgroundColor: '#1565c0' }
            }}
            ref={buttonRef}
          >
            크롤러 업데이트
          </Button>
  
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
            {CRAWLERS.map((crawler) => (
              <MenuItem
                key={crawler.id}
                onClick={() => handleSelect(crawler)}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  minWidth: '200px'
                }}
              >
                <span>{crawler.name}</span>
                <Tooltip
                  title={`마지막 업데이트: ${formatLastUpdate(lastUpdate[crawler.id])}`}
                  placement="right"
                >
                  <InfoIcon
                    fontSize="small"
                    color={lastUpdate[crawler.id] ? 'action' : 'disabled'}
                    sx={{ ml: 1 }}
                  />
                </Tooltip>
              </MenuItem>
            ))}
          </Menu>
        </Box>
  
        <Dialog
          open={progressOpen}
          onClose={handleCloseDialog}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 2 },
            ref: dialogRef
          }}
          aria-labelledby="crawler-progress-dialog-title"
          disableRestoreFocus={true}
          keepMounted
        >
          <DialogTitle id="crawler-progress-dialog-title">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">
                {selectedCrawler?.name || '크롤러'} 업데이트 진행 상황
              </Typography>
              {!isRunning && (
                <IconButton
                  onClick={handleCloseDialog}
                  size="small"
                  aria-label="닫기"
                  edge="end"
                  tabIndex={0}
                  sx={{
                    '&:focus': {
                      outline: '2px solid #3f51b5',
                      outlineOffset: '2px'
                    }
                  }}
                >
                  <CloseIcon />
                </IconButton>
              )}
            </Box>
          </DialogTitle>
  
          <DialogContent>
            <Box sx={{ mb: 4 }}>
              <Card elevation={0} sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 2, mb: 3 }}>
                <Stepper activeStep={activeStep} orientation="horizontal">
                  {CRAWLER_STAGES.map((stage, index) => (
                    <Step key={stage.key}>
                      <StepLabel
                        error={hasError && index === activeStep}
                        optional={
                          index === activeStep ? (
                            <Typography
                              variant="caption"
                              color={
                                index === activeStep
                                  ? hasError
                                    ? 'error.main'
                                    : 'primary.main'
                                  : 'text.secondary'
                              }
                            >
                              {index === activeStep ? progress.message || stage.description : stage.description}
                            </Typography>
                          ) : null
                        }
                        StepIconProps={{
                          icon:
                            hasError && index === activeStep ? (
                              <ErrorIcon color="error" />
                            ) : (
                              <Avatar
                                sx={{
                                  bgcolor:
                                    index < activeStep
                                      ? stage.color
                                      : index === activeStep
                                      ? hasError
                                        ? 'error.main'
                                        : stage.color
                                      : 'grey.300',
                                  width: 24,
                                  height: 24,
                                  boxShadow:
                                    index === activeStep && !hasError
                                      ? '0 0 0 2px #fff, 0 0 0 4px ' + stage.color
                                      : 'none',
                                  animation:
                                    index === activeStep && !hasError && isRunning
                                      ? 'pulse 1.5s infinite'
                                      : 'none',
                                  '@keyframes pulse': {
                                    '0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
                                    '70%': { boxShadow: '0 0 0 6px rgba(33, 150, 243, 0)' },
                                    '100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' }
                                  }
                                }}
                              >
                                {stage.icon}
                              </Avatar>
                            )
                        }}
                      >
                        <Typography
                          variant="body2"
                          fontWeight={index === activeStep ? 'bold' : 'normal'}
                          color={
                            index === activeStep
                              ? hasError
                                ? 'error.main'
                                : 'primary.main'
                              : 'text.primary'
                          }
                        >
                          {stage.label}
                          {index === activeStep && isRunning && !hasError && (
                            <Box
                              component="span"
                              sx={{ ml: 0.5, display: 'inline-flex', alignItems: 'center' }}
                            >
                              <CircularProgress
                                size={12}
                                color="primary"
                                thickness={5}
                                sx={{ color: stage.color }}
                              />
                            </Box>
                          )}
                        </Typography>
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Card>
  
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography
                    variant="subtitle1"
                    fontWeight="500"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      color: hasError
                        ? 'error.main'
                        : CRAWLER_STAGES[activeStep]?.color || 'primary.main'
                    }}
                  >
                    {CRAWLER_STAGES[activeStep]?.icon && (
                      <Box component="span" sx={{ mr: 1, display: 'inline-flex' }}>
                        {CRAWLER_STAGES[activeStep]?.icon}
                      </Box>
                    )}
                    {progress.stage || CRAWLER_STAGES[activeStep]?.label}
                  </Typography>
                  <Typography
                    variant="subtitle1"
                    fontWeight="500"
                    sx={{
                      color: hasError
                        ? 'error.main'
                        : progress.percent >= 100
                        ? 'success.main'
                        : 'primary.main'
                    }}
                  >
                    {progress.percent}%
                  </Typography>
                </Box>
  
                <Box sx={{ position: 'relative', mb: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={progress.percent || 0}
                    sx={{
                      height: 10,
                      borderRadius: 5,
                      bgcolor: 'background.paper',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: hasError
                          ? 'error.main'
                          : CRAWLER_STAGES[activeStep]?.color || 'primary.main',
                        transition: 'transform 0.3s ease-in-out'
                      }
                    }}
                  />
                  {isRunning && !hasError && (
                    <LinearProgress
                      variant="indeterminate"
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 10,
                        borderRadius: 5,
                        opacity: 0.3,
                        bgcolor: 'transparent',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: CRAWLER_STAGES[activeStep]?.color || 'primary.main'
                        }
                      }}
                    />
                  )}
                </Box>
  
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      maxWidth: '85%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {progress.message || '초기화 중...'}
                  </Typography>
                  {isRunning ? (
                    <CircularProgress size={16} color="primary" thickness={5} />
                  ) : hasError ? (
                    <ErrorIcon fontSize="small" color="error" />
                  ) : progress.percent >= 100 ? (
                    <CheckCircleIcon fontSize="small" color="success" />
                  ) : null}
                </Box>
  
                {lastWebSocketUpdate && (
                  <Typography
                    variant="caption"
                    sx={{ mt: 1, display: 'block', textAlign: 'right', color: 'text.secondary' }}
                  >
                    마지막 업데이트:{' '}
                    {formatDistance(lastWebSocketUpdate, new Date(), { addSuffix: true, locale: ko })}
                  </Typography>
                )}
              </Box>
  
              <Card
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: hasError ? 'error.light' : `${CRAWLER_STAGES[activeStep]?.color}15`,
                  borderLeft: hasError
                    ? '4px solid #f44336'
                    : `4px solid ${CRAWLER_STAGES[activeStep]?.color}`,
                  borderRadius: 1
                }}
              >
                <Grid container spacing={2} alignItems="center">
                  <Grid item>
                    <Avatar
                      sx={{
                        bgcolor: hasError
                          ? 'error.main'
                          : CRAWLER_STAGES[activeStep]?.color,
                        width: 40,
                        height: 40
                      }}
                    >
                      {hasError ? <ErrorIcon /> : CRAWLER_STAGES[activeStep]?.icon}
                    </Avatar>
                  </Grid>
                  <Grid item xs>
                    <Typography variant="subtitle1" fontWeight="500">
                      {hasError ? '오류 발생' : CRAWLER_STAGES[activeStep]?.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {hasError
                        ? progress.message
                        : CRAWLER_STAGES[activeStep]?.description}
                    </Typography>
                  </Grid>
                </Grid>
              </Card>
            </Box>
  
            {updatedCVEs && updatedCVEs.count > 0 && (
              <Box sx={{ mt: 3 }}>
                <Divider sx={{ my: 2 }} />
                <Typography
                  variant="h6"
                  gutterBottom
                  sx={{ display: 'flex', alignItems: 'center' }}
                >
                  <CheckCircleIcon sx={{ mr: 1, color: 'success.main' }} />
                  업데이트된 CVE ({updatedCVEs.count}개)
                </Typography>
                <Box
                  sx={{
                    maxHeight: '300px',
                    overflow: 'auto',
                    mt: 1,
                    '&::-webkit-scrollbar': {
                      width: '8px'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      borderRadius: '4px'
                    }
                  }}
                >
                  {updatedCVEs.items.map((cve, index) => (
                    <Paper
                      key={index}
                      elevation={1}
                      sx={{
                        p: 2,
                        mb: 1,
                        borderLeft: '4px solid #2196f3',
                        borderRadius: 1,
                        transition: 'all 0.2s',
                        ':hover': {
                          boxShadow: 3,
                          transform: 'translateY(-2px)'
                        }
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight="bold" color="primary.main">
                        {cve.cveId}
                      </Typography>
                      <Typography variant="body2">{cve.title}</Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>
            )}
          </DialogContent>
  
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2 }}>
            <Button
              onClick={handleCloseDialog}
              disabled={isRunning}
              color="primary"
              variant="contained"
              startIcon={<CloseIcon />}
              aria-label="다이얼로그 닫기"
              tabIndex={0}
              sx={{
                '&.Mui-disabled': {
                  bgcolor: 'rgba(0, 0, 0, 0.12)',
                  color: 'rgba(0, 0, 0, 0.26)'
                },
                '&:focus': {
                  outline: '2px solid #3f51b5',
                  outlineOffset: '2px'
                }
              }}
            >
              닫기
            </Button>
          </Box>
        </Dialog>
      </>
    );
  };
  
  export default CrawlerUpdateButton;