import React, { memo, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Tooltip,
  AvatarGroup,
  Avatar,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Subscriber, SubscriberCountProps } from './types/cve';

// SubscriberCount 컴포넌트 (기존 CVEDetail에서 분리)
const SubscriberCount = memo(({ subscribers = [], cveId }: SubscriberCountProps) => {
  // 로컬 구독자 정보를 기반으로 확장된 구독자 목록 관리
  const [enhancedSubscribers, setEnhancedSubscribers] = useState<Subscriber[]>([]);
  
  useEffect(() => {
    // 1. 입력으로 받은 구독자 정보 확인
    const inputSubscribers = Array.isArray(subscribers) ? subscribers.filter(Boolean) : [];
    
    // 2. 현재 CVE의 구독 정보 확인 (로컬 스토리지)
    try {
      if (!cveId) {
        setEnhancedSubscribers(inputSubscribers);
        return;
      }
      
      // 로컬 스토리지에서 구독 중인 CVE 목록 확인
      const subscribedCves = JSON.parse(localStorage.getItem('cvehub_subscribed_cves') || '[]');
      const isCurrentlySubscribed = subscribedCves.includes(cveId);
      
      // 현재 사용자 정보
      const currentUserId = localStorage.getItem('userId');
      const currentUser: Subscriber | null = currentUserId ? {
        id: currentUserId,
        userId: currentUserId,
        username: localStorage.getItem('username') || '사용자',
        displayName: localStorage.getItem('displayName') || localStorage.getItem('username') || '사용자'
      } : null;
      
      // 입력 및 로컬 정보 합치기
      let mergedSubscribers = [...inputSubscribers];
      
      // 3. 현재 사용자가 구독 중이라면 목록에 추가
      if (isCurrentlySubscribed && currentUser) {
        // 이미 현재 사용자가 구독자 목록에 있는지 확인
        const hasCurrentUser = mergedSubscribers.some(sub => 
          (sub?.id === currentUser.id) || (sub?.userId === currentUser.id)
        );
        
        // 없다면 현재 사용자 추가
        if (!hasCurrentUser) {
          mergedSubscribers.push(currentUser);
          console.log('[SubscriberCount] 현재 사용자 구독자로 추가:', { currentUser, cveId });
        }
      }
      
      setEnhancedSubscribers(mergedSubscribers);
    } catch (error) {
      console.error('[SubscriberCount] 구독자 정보 조회 오류:', error);
      setEnhancedSubscribers(inputSubscribers); // 오류 시 원본 데이터 사용
    }
  }, [subscribers, cveId]);
  
  // 최종적으로 화면에 표시할 구독자 정보
  const validSubscribers = enhancedSubscribers.filter(Boolean);
  const hasSubscribers = validSubscribers.length > 0;
  
  // 디버깅 로그 (개발 중 필요시 유지, 배포 시 제거)
  console.log('[SubscriberCount] 구독자 정보:', {
    원본데이터: subscribers,
    확장된데이터: enhancedSubscribers,
    유효구독자: validSubscribers,
    구독자있음: hasSubscribers,
    구독자수: validSubscribers.length,
    cveId,
    timestamp: new Date().toISOString()
  });

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'action.hover',
        borderRadius: 2,
        py: 0.5,
        px: 1.5
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <VisibilityIcon
          sx={{
            fontSize: 16,
            color: 'text.secondary'
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {hasSubscribers ? `${validSubscribers.length}명이 보는 중` : '보는 중'}
        </Typography>
      </Box>
      {hasSubscribers && (
        <AvatarGroup
          max={5}
          sx={{
            '& .MuiAvatar-root': {
              width: 24,
              height: 24,
              fontSize: '0.75rem',
              border: '2px solid #fff',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                transform: 'scale(1.1)',
                zIndex: 1
              }
            }
          }}
        >
          {validSubscribers.map((subscriber, index) => {
            // subscriber가 유효한 객체인지 확인
            if (!subscriber || typeof subscriber !== 'object') {
              console.log('[SubscriberCount] 유효하지 않은 구독자:', { subscriber, index });
              return null;
            }

            // 디버깅: 구독자 세부 정보 로깅 (개발 중 필요시 유지)
            console.log('[SubscriberCount] 구독자 항목:', {
              index,
              id: subscriber.id,
              userId: subscriber.userId,
              username: subscriber.username,
              displayName: subscriber.displayName,
              profileImage: subscriber.profileImage
            });

            // 고유 키 안전하게 생성
            const key = subscriber.id || subscriber.userId || `subscriber-${index}`;
            const username = subscriber.displayName || subscriber.username || '사용자';
            const profileImage = subscriber.profile_image || subscriber.profileImage;

            return (
              <Tooltip
                key={key}
                title={username}
                placement="bottom"
                arrow
                enterDelay={200}
                leaveDelay={0}
              >
                <Avatar
                  alt={username}
                  src={profileImage}
                  sx={{
                    bgcolor: !profileImage ?
                      `hsl(${(username).length * 30}, 70%, 50%)` : // 이름 기반 색상
                      undefined
                  }}
                >
                  {/* 프로필 이미지 없을 때 첫 글자 표시 */}
                  {!profileImage && (username.charAt(0) || 'U').toUpperCase()}
                </Avatar>
              </Tooltip>
            );
          })}
        </AvatarGroup>
      )}
    </Box>
  );
});

// 컴포넌트 이름 지정 (디버깅용)
SubscriberCount.displayName = 'SubscriberCount';

export default SubscriberCount;
