import React, { useEffect, useState } from 'react';
import { Button, Progress, notification, Spin, Steps, Card, Typography, Badge } from 'antd';
import { WebSocketService } from '../services/websocket';
import { runCrawler } from '../services/crawlerService';
import { CheckCircleOutlined, LoadingOutlined, SyncOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const wsService = new WebSocketService();

// 크롤러 진행 단계 정의
const CRAWLER_STAGES = [
  { key: '준비', title: '준비', icon: <SyncOutlined /> },
  { key: '데이터 수집', title: '데이터 수집', icon: <SyncOutlined /> },
  { key: '데이터 처리', title: '데이터 처리', icon: <SyncOutlined /> }, 
  { key: '데이터베이스 업데이트', title: 'DB 업데이트', icon: <SyncOutlined /> },
  { key: '완료', title: '완료', icon: <CheckCircleOutlined /> }
];

// 각 단계별 예상 진행률 범위 정의 (각 단계 20%씩)
const STAGE_PROGRESS_RANGES = {
  '준비': [0, 20],
  '데이터 수집': [20, 40],
  '데이터 처리': [40, 60],
  '데이터베이스 업데이트': [60, 80],
  '완료': [80, 100]
};

const CrawlerUpdateButton = ({ crawlerType }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [message, setMessage] = useState('');
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [polling, setPolling] = useState(false);
  const [updateSummary, setUpdateSummary] = useState(null);
  const [maxProgress, setMaxProgress] = useState(0);

  // 단계 인덱스 계산 함수
  const calculateStageIndex = (stageName) => {
    if (!stageName) return 0;
    
    const stageMap = {
      '준비': 0,
      '데이터 수집': 1,
      '데이터 처리': 2,
      '데이터베이스 업데이트': 3,
      '완료': 4
    };
    
    // 정확히 일치하는 단계명 확인
    if (stageMap.hasOwnProperty(stageName)) {
      return stageMap[stageName];
    }
    
    // 부분 일치 검사
    for (const [key, index] of Object.entries(stageMap)) {
      if (stageName.includes(key)) {
        return index;
      }
    }
    
    // 기본값
    return 0;
  };

  // 진행률 정규화 함수 - 항상 증가하는 방향으로만 진행
  const normalizeProgress = (rawPercent, stageName) => {
    const stageIndex = calculateStageIndex(stageName);
    const currentStage = CRAWLER_STAGES[stageIndex].key;
    const [min, max] = STAGE_PROGRESS_RANGES[currentStage] || [0, 100];
    
    // 해당 단계 내에서의 상대적 진행률을 계산
    const stageProgress = rawPercent / 100; // 0~1 사이 값
    const currentProgress = min + (max - min) * stageProgress;
    
    // 진행률은 항상 증가하는 방향으로만 (이전 최대값보다 작으면 이전 값 유지)
    const newProgress = Math.max(currentProgress, maxProgress);
    
    // 최대 진행률 업데이트
    if (newProgress > maxProgress) {
      setMaxProgress(newProgress);
    }
    
    return newProgress;
  };

  // 완료 후 상세 정보 가져오는 함수 추가
  const fetchUpdateResults = async (crawlerId) => {
    try {
      const response = await fetch(`/api/crawler/update-results/${crawlerId}`);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('업데이트 결과 조회 오류:', error);
      return null;
    }
  };

  useEffect(() => {
    // 크롤러 전용 연결 시도
    console.log(`${crawlerType} 크롤러용 웹소켓 연결 시도`);
    let connected = false;
    
    wsService.connectToCrawler()
      .then(() => {
        console.log(`${crawlerType} 크롤러 웹소켓 연결 성공`);
        connected = true;
      })
      .catch(error => {
        console.error('크롤러 웹소켓 연결 오류:', error);
        startPolling();
      });
    
    // 메시지 핸들러 등록
    const messageHandler = async (message) => {
      console.log('웹소켓 메시지 수신 (핸들러):', message);
      
      // 크롤러 업데이트 메시지 처리
      if (message.type === 'crawler_update_progress' && 
          message.data.crawler === crawlerType) {
        
        console.log(`${crawlerType} 크롤러 업데이트:`, message.data);
        
        // 단계 변경 감지 및 로깅
        if (message.data.stage !== stage && stage) {
          console.log(`단계 변경: ${stage}(${progress}%) -> ${message.data.stage}(${message.data.percent}%)`);
        }
        
        // 단계 인덱스 계산
        const newStageIndex = calculateStageIndex(message.data.stage);
        setCurrentStageIndex(newStageIndex);
        
        // 정규화된 진행률 계산
        const normalizedProgress = normalizeProgress(
          message.data.percent, 
          message.data.stage
        );
        
        // 완료 또는 오류 상태 확인
        const isCompleted = message.data.stage === "완료" || message.data.percent === 100;
        const isError = message.data.stage === "오류";
        
        setIsUpdating(!(isCompleted || isError) && message.data.isRunning);
        setProgress(Math.round(normalizedProgress));
        setStage(message.data.stage);
        setMessage(message.data.message);
        
        // 로그 추가 - 닫기 버튼 디버깅용
        if (isCompleted || isError) {
          console.log('업데이트 완료/오류 상태 설정: ', {
            stage: message.data.stage,
            stageIndex: newStageIndex,
            isUpdating: false,
            shouldShowCloseButton: true
          });
        }
        
        // 완료 처리
        if (isCompleted) {
          console.log("크롤러 업데이트 완료 처리");
          setCurrentStageIndex(CRAWLER_STAGES.length - 1); // 마지막 단계로 설정
          setProgress(100);
          
          // HTTP 요청으로 상세 정보 가져오기
          try {
            const results = await fetchUpdateResults(crawlerType);
            console.log('[CrawlerUpdate] HTTP 요청으로 업데이트 결과 조회:', results);
            
            if (results && results.results) {
              setUpdateSummary({
                count: results.results.count || 0,
                samples: results.results.items || [],
                severityCounts: results.results.severity_counts || {}
              });
            } else {
              // 결과가 없는 경우 웹소켓에서 받은 count 정보 활용
              setUpdateSummary({
                count: message.data.updated_count || 0,
                samples: []
              });
            }
          } catch (error) {
            console.error('업데이트 결과 조회 오류:', error);
            
            // 오류 발생 시 기본 정보 표시
            setUpdateSummary({
              count: message.data.updated_count || 0,
              samples: []
            });
          }
          
          notification.success({
            message: '업데이트 완료',
            description: message.data.message,
            duration: 5
          });
        }
        
        // 오류 처리
        if (isError) {
          notification.error({
            message: '업데이트 오류',
            description: message.data.message,
            duration: 5
          });
        }
        
        // 완료 또는 오류 상태인 경우 최대 진행률 리셋
        if (isCompleted || isError) {
          setMaxProgress(0);  // 완료 후 리셋
        }
      }
      
      // 오류 처리 개선
      if (message.type === 'crawler_update_error' || 
          (message.type === 'crawler_update_progress' && message.data.stage === "오류")) {
        
        console.error("크롤러 오류 수신:", message.data.message);
        
        // 진행 상태 업데이트
        setIsUpdating(false);
        setStage("오류");
        setMessage(message.data.message);
        
        // 사용자에게 알림
        notification.error({
          message: '업데이트 오류',
          description: message.data.message,
          duration: 10
        });
        
        // 닫기 버튼 활성화를 위한 상태 설정
        setCurrentStageIndex(CRAWLER_STAGES.length - 1);
      }
    };
    
    wsService.addHandler('message', messageHandler);
    
    // 폴링 시작 함수
    const startPolling = () => {
      console.log('웹소켓 백업으로 폴링을 시작합니다.');
      setPolling(true);
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch('/api/crawler/status');
          const data = await response.json();
          console.log('폴링 데이터:', data);
          
          if (data.isRunning && data.lastUpdate.crawler_type === crawlerType) {
            const stageIndex = calculateStageIndex(data.lastUpdate.stage || '준비');
            setCurrentStageIndex(stageIndex);
            
            setIsUpdating(true);
            setProgress(normalizeProgress(
              data.lastUpdate.progress || 0, 
              data.lastUpdate.stage || '준비'
            ));
            setStage(data.lastUpdate.stage || '준비');
            setMessage(data.lastUpdate.message || '');
          }
        } catch (error) {
          console.error('폴링 오류:', error);
        }
      }, 3000);
      
      return () => {
        clearInterval(pollInterval);
      };
    };
    
    return () => {
      wsService.removeHandler('message', messageHandler);
      if (polling) {
        // 폴링 중지 로직
      }
    };
  }, [crawlerType]);
  
  const handleRunCrawler = async () => {
    try {
      setIsUpdating(true);
      setProgress(0);
      setStage('준비');
      setMessage('요청 준비 중...');
      setCurrentStageIndex(0);
      setUpdateSummary(null);
      
      const response = await runCrawler(crawlerType);
      
      if (response.status === 'running') {
        notification.info({
          message: '업데이트 시작',
          description: `${crawlerType} 업데이트가 시작되었습니다.`,
          duration: 3
        });
      } else if (response.status === 'already_running') {
        notification.warning({
          message: '이미 실행 중',
          description: response.message,
          duration: 3
        });
      }
    } catch (error) {
      setIsUpdating(false);
      notification.error({
        message: '크롤러 실행 오류',
        description: error.message || '알 수 없는 오류가 발생했습니다.',
        duration: 5
      });
    }
  };
  
  // 단계별 아이콘 생성 함수
  const getStepIcon = (index) => {
    if (index < currentStageIndex) {
      return <CheckCircleOutlined />; // 완료된 단계
    } else if (index === currentStageIndex) {
      return isUpdating ? <LoadingOutlined /> : <CheckCircleOutlined />; // 현재 단계
    } else {
      return CRAWLER_STAGES[index].icon; // 기본 아이콘
    }
  };
  
  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          onClick={handleRunCrawler}
          loading={isUpdating}
          disabled={isUpdating}
          size="large"
          style={{ marginBottom: 16 }}
        >
          {isUpdating ? '업데이트 중...' : `${crawlerType} 업데이트`}
        </Button>
      </div>
      
      {(isUpdating || currentStageIndex >= 0) && (
        <div>
          {/* 단계별 진행 상태 */}
          <Steps 
            current={currentStageIndex}
            items={CRAWLER_STAGES.map((step, index) => ({
              title: step.title,
              description: index === currentStageIndex ? message.match(/\(\d+\/\d+\)/) || '' : '',
              status: index < currentStageIndex ? 'finish' 
                    : index === currentStageIndex ? (isUpdating ? 'process' : 'finish')
                    : 'wait',
              icon: getStepIcon(index)
            }))}
            style={{ marginBottom: 20 }}
          />
          
          {/* 진행률 표시 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text strong>{stage}</Text>
            <Badge 
              status={isUpdating ? "processing" : "success"} 
              text={<Text type="secondary">{progress}%</Text>} 
            />
          </div>
          <Progress 
            percent={progress} 
            status={isUpdating ? 'active' : 'success'}
            strokeColor={isUpdating ? { from: '#108ee9', to: '#87d068' } : '#52c41a'} 
            style={{ transition: 'all 0.5s ease' }}
          />
          <div style={{ marginTop: 8 }}>
            <Spin size="small" spinning={isUpdating} /> <Text>{message}</Text>
          </div>
          
          {/* 업데이트 요약 정보 표시 */}
          {updateSummary && (
            <div style={{ marginTop: 16, backgroundColor: '#f5f5f5', padding: 12, borderRadius: 4 }}>
              <Title level={5}>업데이트 요약</Title>
              <Text>총 {updateSummary.count}개의 CVE가 업데이트 되었습니다.</Text>
              
              {/* 중요도별 통계 표시 */}
              {updateSummary.severityCounts && (
                <div style={{ marginTop: 8, display: 'flex', gap: '8px' }}>
                  {Object.entries(updateSummary.severityCounts).map(([severity, count]) => (
                    count > 0 && (
                      <Badge 
                        key={severity}
                        count={count} 
                        color={
                          severity === 'critical' ? '#cf1322' :
                          severity === 'high' ? '#fa541c' :
                          severity === 'medium' ? '#fa8c16' : '#52c41a'
                        } 
                        title={`${severity} 위험도: ${count}개`}
                        style={{ marginRight: 8 }}
                      />
                    )
                  ))}
                </div>
              )}
              
              {/* 샘플 CVE 목록 표시 */}
              {updateSummary.samples && updateSummary.samples.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Text strong>주요 업데이트 샘플:</Text>
                  <ul style={{ margin: '8px 0' }}>
                    {updateSummary.samples.map(cve => (
                      <li key={cve.cve_id}>
                        <Text code>{cve.cve_id}</Text> - {cve.title} 
                        <Badge 
                          color={
                            cve.severity === 'critical' ? '#cf1322' :
                            cve.severity === 'high' ? '#fa541c' :
                            cve.severity === 'medium' ? '#fa8c16' : '#52c41a'
                          } 
                          text={cve.severity} 
                          style={{ marginLeft: 8 }}
                        />
                      </li>
                    ))}
                  </ul>
                  {updateSummary.count > updateSummary.samples.length && (
                    <Text type="secondary">
                      외 {updateSummary.count - updateSummary.samples.length}개 CVE 업데이트...
                    </Text>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* 닫기 버튼 추가 */}
          {currentStageIndex >= 0 && (
            stage.includes('완료') || 
            stage.includes('오류') || 
            currentStageIndex === CRAWLER_STAGES.length - 1 || 
            !isUpdating
          ) && (
            <Button 
              type="default" 
              onClick={() => {
                setCurrentStageIndex(-1);
                setProgress(0);
                setMaxProgress(0);
                setStage('');
                setMessage('');
                setUpdateSummary(null);
              }}
              style={{ marginTop: 16 }}
            >
              닫기
            </Button>
          )}
        </div>
      )}
    </Card>
  );
};

export default CrawlerUpdateButton; 