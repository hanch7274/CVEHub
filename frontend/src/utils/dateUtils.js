import { formatInTimeZone } from 'date-fns-tz';
import { ko } from 'date-fns/locale';

// 자주 사용되는 날짜 포맷 상수
export const DATE_FORMATS = {
  // API 통신용 ISO 포맷 (백엔드와 통신할 때 사용)
  API: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
  
  // 화면 표시용 포맷
  DISPLAY: {
    DEFAULT: 'yyyy-MM-dd HH:mm',
    DATE_ONLY: 'yyyy-MM-dd',
    TIME_ONLY: 'HH:mm:ss',
    FULL: 'yyyy년 MM월 dd일 HH시 mm분 ss초'
  }
};

// UTC -> KST 변환 및 포맷팅 (표시용)
export const formatToKST = (dateString, format = DATE_FORMATS.DISPLAY.DEFAULT) => {
  try {
    if (!dateString) {
      console.error('Date string is undefined or null');
      return 'Invalid Date';
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return 'Invalid Date';
    }

    // 명시적으로 9시간 추가
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    return formatInTimeZone(kstDate, 'Asia/Seoul', format, { locale: ko });
  } catch (error) {
    console.error('Date formatting error:', error, 'for date string:', dateString);
    return 'Invalid Date';
  }
};

// UTC 타임스탬프 생성 (API 요청시 사용)
export const getAPITimestamp = () => {
  return new Date().toISOString();
};

// 상대적 시간 표시 (예: "3시간 전")
export const formatRelativeTime = (dateString) => {
  try {
    const date = new Date(dateString);
    // KST로 변환
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const now = new Date();
    const diffInSeconds = Math.floor((now - kstDate) / 1000);

    if (diffInSeconds < 60) return '방금 전';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일 전`;
    
    return formatToKST(dateString, DATE_FORMATS.DISPLAY.DATE_ONLY);
  } catch (error) {
    console.error('Relative time formatting error:', error);
    return 'Invalid Date';
  }
}; 