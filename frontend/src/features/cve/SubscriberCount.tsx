import React, { memo, useMemo, useEffect } from 'react';
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
  // 디버깅용 로그 추가
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('SubscriberCount 렌더링:', {
        cveId,
        subscribersCount: subscribers?.length || 0,
        subscribers
      });
    }
  }, [subscribers, cveId]);

  // 유효한 구독자만 필터링 (개선된 버전)
  const validSubscribers = useMemo(() => {
    if (!Array.isArray(subscribers)) return [];
    
    return subscribers
      .filter(sub => sub && typeof sub === 'object')
      .map(sub => ({
        ...sub,
        id: sub.id || sub.userId || '',
        userId: sub.userId || sub.id || '',
        username: sub.username || 'User',
        displayName: sub.displayName || sub.username || 'User',
        profileImage: sub.profileImage || sub.profile_image || ''
      }))
      .filter(sub => sub.id || sub.userId); // ID가 있는 경우만 유효
  }, [subscribers]);
  
  const hasSubscribers = validSubscribers.length > 0;

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
            // 구독자 정보 추출 및 검증
            const key = subscriber.id || subscriber.userId || `subscriber-${index}`;
            const username = subscriber.displayName || subscriber.username || '사용자';
            const profileImage = subscriber.profileImage || subscriber.profile_image || '';
            const hasProfileImage = Boolean(profileImage && profileImage.length > 0);

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
                  src={hasProfileImage ? profileImage : undefined}
                  sx={{
                    bgcolor: !hasProfileImage ?
                      `hsl(${(username.length * 30) % 360}, 70%, 50%)` : // 이름 기반 색상
                      undefined
                  }}
                >
                  {/* 프로필 이미지 없을 때 첫 글자 표시 */}
                  {!hasProfileImage && (username.charAt(0) || 'U').toUpperCase()}
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