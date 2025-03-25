import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useSocketIO } from '../../../contexts/SocketIOContext'; // 중앙 집중식 웹소켓 관리 컨텍스트
import { formatDistance } from 'date-fns';
import { ko } from 'date-fns/locale';
import logger, { LOG_LEVEL } from '../../../utils/logging';
import { SOCKET_EVENTS, SOCKET_STATE } from '../../../services/socketio/constants';
import useWebSocketHook from '../../../api/hooks/useWebSocketHook'; // 웹소켓 훅 사용

// 로그 레벨 설정 (개발 환경에서 디버그 레벨로 설정)
if (process.env.NODE_ENV === 'development') {
  logger.setLogLevel(LOG_LEVEL.DEBUG);
  logger.setEnabled(true);
  logger.info('CrawlerUpdateButton', '로그 레벨 설정됨', { level: 'DEBUG', enabled: true });
}

// 크롤러 진행 단계 정의
const CRAWLER_STAGES = [
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

// 단계 인덱스 가져오기 (단순화된 버전)
const getStageIndex = (stageName) => {
  if (!stageName) {
    console.log('%c 🔍 단계 이름 없음', 'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', '기본값 0 반환');
    return 0;
  }
  
  // 문자열로 변환 및 소문자화
  const lowerStageName = String(stageName).toLowerCase().trim();
  
  console.log('%c 🔍 단계 매핑 시도', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', { 
    stageName: lowerStageName
  });
  
  // 1. 키 매칭 (표준 방식)
  const stageIndex = CRAWLER_STAGES.findIndex(stage => stage.key === lowerStageName);
  
  if (stageIndex >= 0) {
    console.log(`%c 🔍 키 매칭 성공`, 'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
      stageName: lowerStageName,
      matchedKey: CRAWLER_STAGES[stageIndex].key,
      matchedStage: CRAWLER_STAGES[stageIndex].label,
      index: stageIndex
    });
    return stageIndex;
  }
  
  // 2. 백엔드 값 매칭 (하위 호환성)
  for (let i = 0; i < CRAWLER_STAGES.length; i++) {
    if (CRAWLER_STAGES[i].backendValues && 
        CRAWLER_STAGES[i].backendValues.some(value => 
          value.toLowerCase() === lowerStageName || 
          lowerStageName.includes(value.toLowerCase()) || 
          value.toLowerCase().includes(lowerStageName)
        )) {
      console.log(`%c 🔍 백엔드 값 매칭 성공`, 'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        stageName: lowerStageName,
        matchedStage: CRAWLER_STAGES[i].label,
        index: i
      });
      return i;
    }
  }
  
  // 매칭 실패 시 기본값 (준비 단계) 반환
  console.log(`%c 🔍 매칭 실패`, 'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
    stageName: lowerStageName,
    defaultStage: CRAWLER_STAGES[0].label,
    index: 0
  });
  return 0;
};

/**
 * 웹소켓 이벤트 데이터 처리 함수
 * 
 * @param {object} data - 웹소켓 이벤트 데이터
 * @param {function} setActiveStep - 활성 단계 설정 함수
 * @param {function} setProgress - 진행 상태 설정 함수
 * @param {function} setIsRunning - 실행 상태 설정 함수
 * @param {function} setHasError - 오류 상태 설정 함수
 * @param {function} setLastUpdate - 마지막 업데이트 시간 설정 함수
 * @param {function} setLastWebSocketUpdate - 마지막 웹소켓 업데이트 시간 설정 함수
 * @param {function} handleCrawlerComplete - 크롤러 작업 완료 콜백 함수
 * 
 * @returns {object} 처리 결과 (processed: boolean, data: object)
 */
const processWebSocketData = (data, setActiveStep, setProgress, setIsRunning, setHasError, setLastUpdate, setLastWebSocketUpdate, handleCrawlerComplete) => {
  console.log('%c 🔄 processWebSocketData 함수 호출됨', 'background: #673ab7; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
    rawData: JSON.stringify(data),
    dataType: typeof data
  });

  try {
    // 데이터 유효성 검사
    if (!data || typeof data !== 'object') {
      console.warn('%c ⚠️ 유효하지 않은 데이터 형식', 'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        data: data,
        dataType: typeof data
      });
      return { processed: false, error: 'Invalid data format' };
    }

    // 데이터 구조 확인 및 추출
    let processedData = data;
    
    // 중첩된 데이터 구조 처리 (data.data 형태)
    if (data.data && typeof data.data === 'object') {
      console.log('%c 🔄 중첩된 데이터 구조 감지됨', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        nestedData: JSON.stringify(data.data)
      });
      
      // data.data.data 형태의 중첩 구조 확인 (더 깊은 중첩)
      if (data.data.data && typeof data.data.data === 'object') {
        console.log('%c 🔄 2차 중첩된 데이터 구조 감지됨', 'background: #9c27b0; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
          nestedData: JSON.stringify(data.data.data)
        });
        processedData = data.data.data;
      } else {
        processedData = data.data;
      }
    }
    
    // 타입 필드가 있는 경우 해당 구조에 맞게 처리
    if (processedData.type === 'crawler_update_progress' && processedData.data) {
      console.log('%c 🔄 타입 기반 데이터 구조 감지됨', 'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        type: processedData.type,
        typeData: JSON.stringify(processedData.data)
      });
      processedData = processedData.data;
    }
    
    console.log('%c 🔄 추출된 데이터', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
      processedData: JSON.stringify(processedData)
    });

    // 단계 정보 업데이트
    if (setActiveStep) {
      // stage 정보가 문자열인 경우 (가장 일반적인 케이스)
      if (typeof processedData.stage === 'string') {
        const stageIndex = getStageIndex(processedData.stage);
        console.log('%c 🔄 스테이지 업데이트 (문자열)', 'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
          stage: processedData.stage,
          stageIndex: stageIndex
        });
        setActiveStep(stageIndex);
        
        // 단계 레이블이 있으면 업데이트
        if (processedData.stage_label && setProgress) {
          setProgress(prevProgress => ({
            ...prevProgress,
            stage: processedData.stage_label
          }));
        }
      } 
      // stage가 명시적으로 'error'인 경우
      else if (processedData.error || processedData.hasError) {
        console.log('%c 🔄 오류 상태 감지됨', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;');
        const errorIndex = getStageIndex('error');
        setActiveStep(errorIndex);
        
        // 오류 상태 표시
        if (setHasError) {
          setHasError(true);
        }
      }
    }

    // 진행 상태 업데이트
    if (setProgress) {
      // 진행 상태 객체 구성
      const updatedProgress = {
        // 1. stage_label이 있으면 우선 사용
        // 2. 없으면 CRAWLER_STAGES에서 현재 스테이지의 레이블 사용
        // 3. 둘 다 없으면 백엔드에서 보낸 stage 사용
        // 4. 그것도 없으면 빈 문자열
        stage: processedData.stage_label || 
              (processedData.stage && CRAWLER_STAGES[getStageIndex(processedData.stage)]?.label) || 
              processedData.stage || 
              '',
        // 명시적 percent 필드가 있으면 사용, 없으면 기존값 유지 또는 0
        percent: typeof processedData.percent === 'number' ? processedData.percent : 0,
        // 메시지가 있으면 사용, 없으면 기존값 유지 또는 빈 문자열
        message: processedData.message || ''
      };
      
      console.log('%c 🔄 진행률 업데이트', 'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        progress: updatedProgress
      });
      
      setProgress(prevProgress => ({
        ...prevProgress,
        ...updatedProgress
      }));
    }

    // 실행 상태 업데이트
    if (setIsRunning) {
      // stage 키 기반으로 실행 중 상태 판단
      const stageValue = processedData.stage?.toLowerCase();
      
      // CRAWLER_STAGES에서 정의된 backendValues 배열 활용
      // 완료 상태 확인
      const completedValues = CRAWLER_STAGES.find(stage => stage.key === 'completed')?.backendValues || [];
      const isCompleted = stageValue ? 
        completedValues.includes(stageValue) || 
        completedValues.some(value => stageValue.includes(value)) : 
        false;
      
      // 오류 상태 확인
      const errorValues = CRAWLER_STAGES.find(stage => stage.key === 'error')?.backendValues || [];
      const isError = stageValue ? 
        errorValues.includes(stageValue) || 
        errorValues.some(value => stageValue.includes(value)) : 
        false;
      
      // 실행 중 상태
      const isRunningStatus = stageValue ? (!isCompleted && !isError) : false;
      
      console.log('%c 🔄 실행 상태 업데이트', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        stage: processedData.stage,
        isRunning: isRunningStatus,
        isCompleted: isCompleted,
        isError: isError
      });
      
      setIsRunning(isRunningStatus);
      
      // 오류 상태 설정
      if (setHasError) {
        setHasError(isError);
      }

      // 완료된 경우 콜백 호출
      if (!isRunningStatus && isCompleted && handleCrawlerComplete) {
        console.log('%c 🔄 작업 완료, 콜백 호출', 'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;');
        handleCrawlerComplete();
      }
    }

    // 마지막 업데이트 시간 설정
    if (setLastUpdate) {
      const now = new Date();
      console.log('%c 🔄 마지막 업데이트 시간 설정', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        timestamp: now.toISOString()
      });
      setLastUpdate(now);
    }

    // 마지막 웹소켓 업데이트 시간 설정
    if (setLastWebSocketUpdate) {
      const now = new Date();
      console.log('%c 🔄 마지막 웹소켓 업데이트 시간 설정', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        timestamp: now.toISOString()
      });
      setLastWebSocketUpdate(now);
    }

    console.log('%c ✅ 데이터 처리 완료', 'background: #4caf50; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
      processedData: JSON.stringify(processedData),
      result: { processed: true }
    });
    return { processed: true, data: processedData };
  } catch (error) {
    console.error('%c ❌ 데이터 처리 중 오류 발생', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
      error: error.message,
      stack: error.stack,
      data: data ? JSON.stringify(data) : 'undefined'
    });
    return { processed: false, error: error.message };
  }
};

const CrawlerUpdateButton = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedCrawler, setSelectedCrawler] = useState(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progress, setProgress] = useState({ stage: '', percent: 0, message: '' });
  const [isRunning, setIsRunning] = useState(false);
  const [lastUpdate, setLastUpdate] = useState({});
  const [updatedCVEs, setUpdatedCVEs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [pollTimer, setPollTimer] = useState(null);
  const [lastWebSocketUpdate, setLastWebSocketUpdate] = useState(null);
  const queryClient = useQueryClient();
  
  // 중앙 웹소켓 관리 컨텍스트 사용
  const socketIO = useSocketIO();

  // 다이얼로그 외부 요소 참조 추가
  const buttonRef = useRef(null);
  const dialogRef = useRef(null);

  // 크롤러 옵션
  const CRAWLERS = [
    { id: 'nuclei', name: 'Nuclei Templates', type: 'nuclei' },
    { id: 'metasploit', name: 'Metasploit', type: 'metasploit' },
    { id: 'emerging_threats', name: 'EmergingThreats Rules', type: 'emerging_threats' }
  ];

  // 크롤러 상태 로드 함수 wrapped in useCallback
  const loadCrawlerStatus = useCallback(async () => {
    // 초기 크롤러 상태 로드
    try {
      setLoading(true);
      const status = await api.get('/crawler/status');
      
      console.log('%c 🔄 크롤러 상태 로드', 'background: #673ab7; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;', {
        status: status.data
      });
      
      // 실행 상태 설정
      setIsRunning(status.data.isRunning);
      
      // 단계 정보가 있는 경우 설정
      if (status.data.currentStatus) {
        const currentStatus = status.data.currentStatus;
        
        // 활성 단계 설정
        if (typeof currentStatus.stage === 'string') {
          const stageIndex = getStageIndex(currentStatus.stage);
          setActiveStep(stageIndex);
        }
        
        // 진행 상태 초기화
        setProgress({
          stage: currentStatus.stage_label || 
                (currentStatus.stage && CRAWLER_STAGES[getStageIndex(currentStatus.stage)]?.label) || 
                currentStatus.stage || 
                CRAWLER_STAGES[0].label,
          percent: typeof currentStatus.percent === 'number' ? currentStatus.percent : 0,
          message: currentStatus.message || ''
        });
      }
      
      // 크롤러별 마지막 업데이트 시간 처리
      const newLastUpdate = {};
      
      // 1. results 객체에 있는 각 크롤러의 정보를 확인
      if (status.data.results) {
        // results에 포함된 크롤러들만 해당 결과 시간 적용
        Object.keys(status.data.results).forEach(crawlerType => {
          // 크롤러 타입에 해당하는 ID 찾기
          const crawler = CRAWLERS.find(c => c.type === crawlerType);
          if (crawler) {
            newLastUpdate[crawler.id] = status.data.lastUpdate;
          }
        });
      }
      
      // 2. results에 없는 크롤러는 '없음'으로 표시되도록 함
      CRAWLERS.forEach(crawler => {
        if (!newLastUpdate[crawler.id]) {
          newLastUpdate[crawler.id] = null;
        }
      });
      
      // 3. 전체 시스템 마지막 업데이트 시간도 저장
      newLastUpdate['default'] = status.data.lastUpdate;
      
      // 상태 업데이트
      setLastUpdate(newLastUpdate);
    } catch (error) {
      logger.error('크롤러', '상태 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCrawler]);

  // 폴링 중지 함수 wrapped in useCallback
  const stopPolling = useCallback(() => {
    if (pollTimer) {
      logger.info('폴링 중지');
      clearInterval(pollTimer);
      setPollTimer(null);
    }
  }, [pollTimer]);
  
  // 폴링 시작 함수
  const startPolling = () => {
    // 이미 폴링 중이라면 중지
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    
    logger.info('폴링 시작');
    
    // 폴링 시작
    try {
      const timer = setInterval(async () => {
        try {
          if (!isRunning) {
            stopPolling();
            return;
          }
          
          // 상태 로드 함수 호출 (중복 코드 제거)
          await loadCrawlerStatus();
          
        } catch (error) {
          logger.error('폴링', '크롤러 상태 조회 실패:', error);
        }
      }, 3000); // 3초마다 폴링
      
      setPollTimer(timer);
    } catch (error) {
      logger.error('폴링', '타이머 설정 실패:', error);
    }
  };

  // 크롤러 작업이 완료될 때 CVE 목록 갱신
  const handleCrawlerComplete = useCallback((updatedCves) => {
    logger.info('크롤러 작업 완료, CVE 목록 갱신');
    enqueueSnackbar('크롤러 작업이 완료되었습니다. CVE 목록을 갱신합니다.', { 
      variant: 'success',
      autoHideDuration: 4000
    });
    
    // 쿼리 무효화하여 데이터 갱신
    queryClient.invalidateQueries({ queryKey: ['cves'] });

    // 크롤러 작업 초기화
    stopPolling();
    setIsRunning(false);
    setProgress(prevProgress => ({
      ...prevProgress,
      message: '작업이 완료되었습니다. 결과를 확인하세요.'
    }));
    
    // 업데이트된 CVE 정보 설정 (있는 경우)
    if (updatedCves) {
      setUpdatedCVEs(updatedCves);
    }
  }, [enqueueSnackbar, queryClient, stopPolling]);

  // 연결 상태 관리를 위한 상태 추가
  const [isSocketConnected, setIsSocketConnected] = useState(socketIO.connected);

  // 웹소켓 연결 상태 이벤트 구독
  useEffect(() => {
    // 초기 상태 설정
    setIsSocketConnected(socketIO.connected);
    
    // 연결 상태 변경 이벤트 구독
    const unsubscribe = socketIO.subscribeEvent(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, (data) => {
      const newConnectionState = data.state === SOCKET_STATE.CONNECTED;
      
      // 상태 업데이트는 항상 함수형 업데이트 사용
      setIsSocketConnected(prevState => {
        // 이전 상태와 다를 때만 로그 출력 및 상태 업데이트
        if (prevState !== newConnectionState) {
          if (process.env.NODE_ENV === 'development') {
            console.log('CrawlerUpdateButton: 연결 상태 변경됨', {
              state: data.state,
              isConnected: newConnectionState
            });
          }
          return newConnectionState;
        }
        return prevState;
      });
    });
    
    // 클린업 함수
    return () => {
      unsubscribe();
    };
  }, [socketIO]);
  
  // 크롤러 업데이트 이벤트 핸들러
  const handleCrawlerUpdateEvent = useCallback((data) => {
    logger.info('CrawlerUpdateButton', '크롤러 업데이트 이벤트 수신', {
      eventType: SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS,
      stage: data?.stage,
      percent: data?.percent
    });
    
    // 웹소켓 데이터 처리
    processWebSocketData(
      data, 
      setActiveStep, 
      setProgress, 
      setIsRunning, 
      setHasError, 
      setLastUpdate, 
      setLastWebSocketUpdate, 
      handleCrawlerComplete
    );
  }, [handleCrawlerComplete]);
  
  // useWebSocketHook을 사용한 웹소켓 이벤트 구독
  useWebSocketHook(SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS, handleCrawlerUpdateEvent, {
    optimisticUpdate: false // 낙관적 업데이트는 불필요
  });

  // 웹소켓 연결 상태에 따른 폴링 제어
  useEffect(() => {
    if (isRunning) {
      if (!isSocketConnected) {
        // 웹소켓 연결이 없으면 폴링으로 대체
        if (!pollTimer) {
          logger.info('CrawlerUpdateButton', '웹소켓 연결 없음 - 폴링 시작');
          startPolling();
        }
      } else if (lastWebSocketUpdate) {
        // 웹소켓 연결이 복구되고 이전에 웹소켓 이벤트를 받은 적이 있으면 폴링 중지
        if (pollTimer) {
          logger.info('CrawlerUpdateButton', '웹소켓 연결 복구됨 - 폴링 중지');
          stopPolling();
        }
      }
    } else if (pollTimer) {
      // 크롤러가 실행 중이 아니면 폴링 중지
      logger.info('CrawlerUpdateButton', '크롤러 실행 중지됨 - 폴링 중지');
      stopPolling();
    }
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      if (pollTimer) {
        logger.info('CrawlerUpdateButton', '컴포넌트 언마운트 - 폴링 중지');
        stopPolling();
      }
    };
  }, [isSocketConnected, isRunning, pollTimer, lastWebSocketUpdate, startPolling, stopPolling]);

  // 상태 초기화
  useEffect(() => {
    // 컴포넌트 마운트 시 약간의 지연을 두고 크롤러 상태 로드
    const timer = setTimeout(() => {
      loadCrawlerStatus();
    }, 500); // 500ms 지연
    
    return () => clearTimeout(timer);
  }, [loadCrawlerStatus]);

  // 메뉴 열기
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  // 메뉴 닫기
  const handleClose = () => {
    setAnchorEl(null);
  };

  // 크롤러 선택
  const handleSelect = (crawler) => {
    setSelectedCrawler(crawler);
    setAnchorEl(null);
    runCrawler(crawler);
  };

  // 크롤러 실행
  const runCrawler = async (crawler) => {
    try {
      setSelectedCrawler(crawler);
      setProgressOpen(true);
      setProgress({ stage: '준비 중', percent: 0, message: '크롤러 초기화 중...' });
      setActiveStep(0);
      setHasError(false);
      setUpdatedCVEs(null);
      
      await api.post(`/crawler/run/${crawler.type}`, { id: crawler.id });
      startPolling();      
    } catch (error) {
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

// 마지막 업데이트 시간 포맷팅 함수
const formatLastUpdate = (lastUpdate) => {

  // 값이 없는 경우
  if (!lastUpdate) return '없음';
  
  try {
    // 문자열인 경우 (API에서 직접 날짜 문자열을 반환하는 경우)
    if (typeof lastUpdate === 'string') {
      const date = new Date(lastUpdate);
      return formatDistance(date, new Date(), { addSuffix: true, locale: ko });
    }
    
    // 객체인 경우 (API에서 객체를 반환하는 경우 대비)
    if (typeof lastUpdate === 'object' && Object.keys(lastUpdate).length > 0) {
      const dateString = lastUpdate.datetime || lastUpdate.date || lastUpdate.timestamp;
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

  // 다이얼로그 닫기 함수 개선
  const handleCloseDialog = useCallback(() => {
    // 실행 중이면 닫지 않음
    if (isRunning) return;
    
    // 포커스를 다이얼로그 외부로 이동시킨 후 다이얼로그 닫기
    if (buttonRef.current) {
      buttonRef.current.focus();
    }
    // 약간의 지연 후 다이얼로그 닫기 (포커스 이동 후)
    setTimeout(() => {
      setProgressOpen(false);
    }, 10);
  }, [isRunning]);
  
  // 이스케이프 키로 닫기 처리
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && progressOpen && !isRunning) {
        handleCloseDialog();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [progressOpen, isRunning, handleCloseDialog]);

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
        
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
        >
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
                  color={lastUpdate[crawler.id] ? "action" : "disabled"}
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
                    outlineOffset: '2px',
                  },
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
                      optional={index === activeStep ? (
                        <Typography variant="caption" color={index === activeStep ? (hasError ? 'error.main' : 'primary.main') : 'text.secondary'}>
                          {index === activeStep ? progress.message || stage.description : stage.description}
                        </Typography>
                      ) : null}
                      StepIconProps={{
                        icon: hasError && index === activeStep ? <ErrorIcon color="error" /> : (
                          <Avatar sx={{ 
                            bgcolor: index < activeStep 
                              ? stage.color 
                              : index === activeStep 
                                ? (hasError ? 'error.main' : stage.color) 
                                : 'grey.300',
                            width: 24, 
                            height: 24,
                            boxShadow: index === activeStep && !hasError ? '0 0 0 2px #fff, 0 0 0 4px ' + stage.color : 'none',
                            animation: index === activeStep && !hasError && isRunning ? 'pulse 1.5s infinite' : 'none',
                            '@keyframes pulse': {
                              '0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
                              '70%': { boxShadow: '0 0 0 6px rgba(33, 150, 243, 0)' },
                              '100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' }
                            }
                          }}>
                            {stage.icon}
                          </Avatar>
                        )
                      }}
                    >
                      <Typography 
                        variant="body2" 
                        fontWeight={index === activeStep ? 'bold' : 'normal'}
                        color={index === activeStep ? (hasError ? 'error.main' : 'primary.main') : 'text.primary'}
                      >
                        {stage.label}
                        {index === activeStep && isRunning && !hasError && (
                          <Box component="span" sx={{ ml: 0.5, display: 'inline-flex', alignItems: 'center' }}>
                            <CircularProgress size={12} color="primary" thickness={5} sx={{ color: stage.color }} />
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
                <Typography variant="subtitle1" fontWeight="500" sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  color: hasError ? 'error.main' : (CRAWLER_STAGES[activeStep]?.color || 'primary.main')
                }}>
                  {CRAWLER_STAGES[activeStep]?.icon && (
                    <Box component="span" sx={{ mr: 1, display: 'inline-flex' }}>
                      {CRAWLER_STAGES[activeStep]?.icon}
                    </Box>
                  )}
                  {progress.stage || CRAWLER_STAGES[activeStep]?.label}
                </Typography>
                <Typography variant="subtitle1" fontWeight="500" sx={{
                  color: hasError ? 'error.main' : (progress.percent >= 100 ? 'success.main' : 'primary.main')
                }}>
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
                      bgcolor: hasError ? 'error.main' : CRAWLER_STAGES[activeStep]?.color || 'primary.main',
                      transition: 'transform 0.3s ease-in-out'
                    }
                  }} 
                />
                {/* 진행 상태에 따른 애니메이션 효과 */}
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
                        bgcolor: CRAWLER_STAGES[activeStep]?.color || 'primary.main',
                      }
                    }}
                  />
                )}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ 
                  color: 'text.secondary',
                  maxWidth: '85%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {progress.message || '초기화 중...'}
                </Typography>
                {/* 상태 아이콘 표시 */}
                {isRunning ? (
                  <CircularProgress size={16} color="primary" thickness={5} />
                ) : hasError ? (
                  <ErrorIcon fontSize="small" color="error" />
                ) : progress.percent >= 100 ? (
                  <CheckCircleIcon fontSize="small" color="success" />
                ) : null}
              </Box>
              
              {/* 마지막 웹소켓 업데이트 시간 표시 */}
              {lastWebSocketUpdate && (
                <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'right', color: 'text.secondary' }}>
                  마지막 업데이트: {formatDistance(lastWebSocketUpdate, new Date(), { addSuffix: true, locale: ko })}
                </Typography>
              )}
            </Box>

            <Card 
              elevation={0} 
              sx={{ 
                p: 2, 
                bgcolor: hasError ? 'error.light' : `${CRAWLER_STAGES[activeStep]?.color}15`,
                borderLeft: hasError ? '4px solid #f44336' : `4px solid ${CRAWLER_STAGES[activeStep]?.color}`,
                borderRadius: 1
              }}
            >
              <Grid container spacing={2} alignItems="center">
                <Grid item>
                  <Avatar 
                    sx={{ 
                      bgcolor: hasError ? 'error.main' : CRAWLER_STAGES[activeStep]?.color,
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
                    {hasError ? progress.message : CRAWLER_STAGES[activeStep]?.description}
                  </Typography>
                </Grid>
              </Grid>
            </Card>
          </Box>

          {updatedCVEs && updatedCVEs.count > 0 && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <CheckCircleIcon sx={{ mr: 1, color: 'success.main' }} />
                업데이트된 CVE ({updatedCVEs.count}개)
              </Typography>
              <Box sx={{ 
                maxHeight: '300px', 
                overflow: 'auto', 
                mt: 1,
                '&::-webkit-scrollbar': {
                  width: '8px',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  borderRadius: '4px',
                },
              }}>
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
                      {cve.cve_id}
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
                outlineOffset: '2px',
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