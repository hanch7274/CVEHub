import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
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
  StepContent,
  Card,
  Grid,
  Avatar
} from '@mui/material';
import { 
  Update as UpdateIcon, 
  KeyboardArrowDown as ArrowDownIcon,
  Close as CloseIcon,
  InfoOutlined as InfoIcon,
  Settings as SettingsIcon,
  Search as SearchIcon,
  DataObject as DataObjectIcon,
  Storage as StorageIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import crawlerService from '../../../api/services/crawlerService';
import { fetchCVEList } from '../../../store/slices/cveSlice';
import { useWebSocketMessage } from '../../../contexts/WebSocketContext';
import { formatDistance } from 'date-fns';
import { ko } from 'date-fns/locale';

// 웹소켓 이벤트 타입
const WS_EVENT_TYPE = {
  CRAWLER_UPDATE_PROGRESS: 'crawler_update_progress'
};

// 크롤러 진행 단계 정의
const CRAWLER_STAGES = [
  {
    key: 'preparing',
    label: '준비 중',
    description: '크롤러 초기화 및 저장소 연결 준비',
    icon: <SettingsIcon />,
    color: '#3f51b5'
  },
  {
    key: 'collecting',
    label: '데이터 수집',
    description: '원격 저장소에서 최신 데이터를 가져오는 중',
    icon: <SearchIcon />,
    color: '#2196f3'
  },
  {
    key: 'processing',
    label: '데이터 처리',
    description: 'CVE 정보 파싱 및 가공 중',
    icon: <DataObjectIcon />,
    color: '#00bcd4'
  },
  {
    key: 'updating',
    label: '데이터베이스 업데이트',
    description: '새로운 CVE 정보 저장 중',
    icon: <StorageIcon />,
    color: '#009688'
  },
  {
    key: 'completed',
    label: '완료',
    description: '모든 작업이 완료되었습니다',
    icon: <CheckCircleIcon />,
    color: '#4caf50'
  }
];

// 스테이지 문자열을 인덱스로 변환하는 함수
const getStageIndex = (stage) => {
  if (!stage) return 0;
  
  // 단계가 '오류'인 경우
  if (stage === '오류') return -1;
  
  // 진행률에 따라 완료 여부 결정
  if (stage === '완료') return 4;
  
  // 단계명으로 매핑 (백엔드와 일치시킴)
  const stageMap = {
    '초기화': 0,
    '준비 중': 0,
    '연결': 1,
    '데이터 수집': 1,
    '수집': 1,
    '처리': 2,
    '데이터 처리': 2,
    '업데이트': 3,
    '데이터베이스 업데이트': 3
  };
  
  return stageMap[stage] !== undefined ? stageMap[stage] : 0;
};

const CrawlerUpdateButton = () => {
  const dispatch = useDispatch();
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

  // 크롤러 옵션
  const CRAWLERS = [
    { id: 'nuclei', name: 'Nuclei Templates' },
    { id: 'metasploit', name: 'Metasploit' },
    { id: 'emerging_threats', name: 'EmergingThreats Rules' }
  ];

  // 초기 상태 로드
  useEffect(() => {
    loadCrawlerStatus();
  }, []);

  // 크롤러 상태 로드
  const loadCrawlerStatus = async () => {
    try {
      setLoading(true);
      const status = await crawlerService.getCrawlerStatus();
      setIsRunning(status.isRunning);
      setLastUpdate(status.lastUpdate || {});
    } catch (error) {
      console.error('상태 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 웹소켓 메시지 처리
  useWebSocketMessage((message) => {
    if (message?.type === WS_EVENT_TYPE.CRAWLER_UPDATE_PROGRESS) {
      const data = message.data;
      
      // 웹소켓 상태 업데이트 시간 기록
      setLastWebSocketUpdate(new Date());
      
      // 진행 상황 업데이트
      setProgress({
        stage: data.stage,
        percent: data.percent,
        message: data.message
      });
      
      // 완료 또는 오류 상태일 때는 항상 isRunning을 false로 설정
      if (data.stage === '완료' || data.stage === '오류') {
        setIsRunning(false);
      } else {
        // 그 외의 경우에는 백엔드에서 보낸 isRunning 값을 사용
        setIsRunning(data.isRunning);
      }
      
      // 현재 단계 업데이트
      const stageIndex = getStageIndex(data.stage);
      if (stageIndex >= 0) {
        setActiveStep(stageIndex);
        setHasError(false);
      } else {
        setHasError(true); // 오류 상태 설정
      }
      
      // 업데이트된 CVE 목록이 있으면 표시
      if (data.updated_cves) {
        // 배열이나 객체 여부 확인 후 안전하게 처리
        if (Array.isArray(data.updated_cves)) {
          setUpdatedCVEs({
            count: data.updated_cves.length,
            items: data.updated_cves
          });
        } else if (typeof data.updated_cves === 'object') {
          // 객체 형태일 경우
          setUpdatedCVEs(data.updated_cves);
        } else {
          console.warn('업데이트된 CVE 데이터 형식이 예상과 다릅니다:', data.updated_cves);
        }
      }
      
      // 완료 또는 오류 상태이면 폴링 중지
      if (data.stage === '완료' || data.stage === '오류') {
        stopPolling();
        
        // 팝업이 닫혀있으면 자동으로 열기
        if (!progressOpen && selectedCrawler) {
          setProgressOpen(true);
        }
        
        // 완료 시 CVE 목록 새로고침
        if (data.stage === '완료') {
          dispatch(fetchCVEList());
          enqueueSnackbar(`${selectedCrawler.name} 업데이트가 완료되었습니다.`, { 
            variant: 'success',
            autoHideDuration: 5000,
          });
        }
      }
    }
  });

  // 폴링 시작 함수 개선
  const startPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    
    // 웹소켓 연결 상태 확인
    const isWebSocketConnected = !!window.webSocket && window.webSocket.readyState === WebSocket.OPEN;
    
    // 웹소켓이 연결되어 있으면 폴링 필요 없음 (선택적)
    if (isWebSocketConnected) {
      console.log('웹소켓이 연결되어 있어 폴링을 시작하지 않습니다.');
      return;
    }
    
    console.log('웹소켓 백업으로 폴링을 시작합니다.');
    
    // 5초마다 상태 확인
    const timer = setInterval(async () => {
      try {
        const status = await crawlerService.getCrawlerStatus();
        
        // 웹소켓을 통해 마지막으로 받은 상태가 있다면, 폴링으로 받은 상태보다 우선함
        if (!lastWebSocketUpdate) {
          setIsRunning(status.isRunning);
          setLastUpdate(status.lastUpdate || {});
        }
        
        // 웹소켓 상태가 없고, 폴링 결과 실행 중이 아니면 폴링 중지
        if (!lastWebSocketUpdate && !status.isRunning) {
          console.log('크롤러가 실행 중이 아니어서 폴링을 중지합니다.');
          stopPolling();
        }
      } catch (error) {
        console.error('상태 폴링 중 오류:', error);
      }
    }, 5000);
    
    setPollTimer(timer);
  };

  // 폴링 중지 함수
  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      setPollTimer(null);
    }
  };

  // 컴포넌트 마운트/언마운트 시 폴링 관리
  useEffect(() => {
    // 컴포넌트 마운트 시 상태 확인
    loadCrawlerStatus();
    
    // 언마운트 시 폴링 중지
    return () => stopPolling();
  }, []);

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
      
      // 크롤러 실행 요청
      await crawlerService.runCrawler(crawler.id);
      
      // 폴링 시작 (웹소켓 연결이 끊어질 경우를 대비)
      startPolling();
      
    } catch (error) {
      console.error('크롤러 실행 오류:', error);
      setHasError(true);
      
      // 서버 오류 메시지 표시 (중복 실행 등의 문제 포함)
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

  // 마지막 업데이트 시간 포맷팅
  const formatLastUpdate = (dateString) => {
    if (!dateString) return '없음';
    try {
      const date = new Date(dateString);
      return formatDistance(date, new Date(), { addSuffix: true, locale: ko });
    } catch (e) {
      return '알 수 없음';
    }
  };

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
            background: 'linear-gradient(45deg, #3f51b5 30%, #2196f3 90%)',
            boxShadow: '0 3px 5px 2px rgba(33, 150, 243, .3)'
          }}
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
                <InfoIcon fontSize="small" color="action" sx={{ ml: 1 }} />
              </Tooltip>
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* 진행 상황 대화상자 */}
      <Dialog 
        open={progressOpen} 
        onClose={() => !isRunning && setProgressOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {selectedCrawler?.name || '크롤러'} 업데이트 진행 상황
            </Typography>
            {/* 닫기 버튼 - 실행 중이 아닐 때만 활성화 */}
            {!isRunning && (
              <IconButton
                onClick={() => setProgressOpen(false)}
                size="small"
                aria-label="닫기"
              >
                <CloseIcon />
              </IconButton>
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* 진행 단계 표시 */}
          <Box sx={{ mb: 4 }}>
            <Card elevation={0} sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 2, mb: 3 }}>
              <Stepper activeStep={activeStep} orientation="horizontal">
                {CRAWLER_STAGES.map((stage, index) => (
                  <Step key={stage.key}>
                    <StepLabel
                      error={hasError && index === activeStep}
                      optional={index === activeStep ? (
                        <Typography variant="caption">{progress.message}</Typography>
                      ) : null}
                      StepIconProps={{
                        icon: hasError && index === activeStep ? <ErrorIcon color="error" /> : (
                          <Avatar sx={{ 
                            bgcolor: index <= activeStep ? stage.color : 'grey.300',
                            width: 24, 
                            height: 24 
                          }}>
                            {stage.icon}
                          </Avatar>
                        )
                      }}
                    >
                      {stage.label}
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>
            </Card>

            {/* 진행률 표시 */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle1" fontWeight="500">
                  {progress.stage || '준비 중'}
                </Typography>
                <Typography variant="subtitle1" fontWeight="500">
                  {progress.percent}%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={progress.percent || 0} 
                sx={{ 
                  height: 10, 
                  borderRadius: 5,
                  bgcolor: 'background.paper',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: hasError ? 'error.main' : CRAWLER_STAGES[activeStep]?.color || 'primary.main'
                  }
                }} 
              />
              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                {progress.message || '초기화 중...'}
              </Typography>
            </Box>

            {/* 현재 단계 상세 정보 */}
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

          {/* 업데이트된 CVE 목록 */}
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
            onClick={() => setProgressOpen(false)}
            disabled={isRunning}
            color="primary"
            variant="contained"
            startIcon={<CloseIcon />}
            sx={{
              '&.Mui-disabled': {
                bgcolor: 'rgba(0, 0, 0, 0.12)',
                color: 'rgba(0, 0, 0, 0.26)'
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