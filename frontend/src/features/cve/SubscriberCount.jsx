import React, { memo } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Tooltip,
  AvatarGroup,
  Avatar,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';

// SubscriberCount 컴포넌트 (기존 CVEDetail에서 분리)
const SubscriberCount = memo(({ subscribers = [] }) => {
  // 배열이 아니거나 비어있는 경우를 명시적으로 체크
  const validSubscribers = Array.isArray(subscribers) ? subscribers.filter(Boolean) : [];
  const hasSubscribers = validSubscribers.length > 0;

  // 디버깅 로그 (개발 중 필요시 유지, 배포 시 제거)
  console.log('[SubscriberCount] 구독자 정보:', {
    원본데이터: subscribers,
    유효구독자: validSubscribers,
    구독자있음: hasSubscribers,
    구독자수: validSubscribers.length,
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

SubscriberCount.propTypes = {
  subscribers: PropTypes.array
};

export default SubscriberCount;