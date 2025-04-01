import { format, parseISO, isValid } from 'date-fns';
import { formatInTimeZone, utcToZonedTime } from 'date-fns-tz';
import { ko } from 'date-fns/locale';

// 날짜 포맷 상수
export const DATE_FORMATS = {
  API: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", // API 통신용 ISO 포맷 (모든 문자를 작은따옴표로 이스케이프)
  DISPLAY: {
    DEFAULT: 'yyyy-MM-dd HH:mm',
    DATE_ONLY: 'yyyy-MM-dd',
    TIME_ONLY: 'HH:mm:ss',
    FULL: 'yyyy-MM-dd HH:mm:ss',
    YEAR_MONTH: 'yyyy-MM'
  }
} as const;

// 시간대 상수
export const TIME_ZONES = {
  UTC: 'UTC',
  KST: 'Asia/Seoul',
  DEFAULT: process.env.REACT_APP_DEFAULT_TIMEZONE || 'Asia/Seoul'
} as const;

// 타입 정의
export type DateFormatType = typeof DATE_FORMATS.DISPLAY[keyof typeof DATE_FORMATS.DISPLAY] | typeof DATE_FORMATS.API;
export type TimeZoneType = typeof TIME_ZONES[keyof typeof TIME_ZONES];
export type DateValueType = string | Date | number | null | undefined;

/**
 * 현재 UTC 시간을 ISO 8601 형식의 문자열로 반환합니다.
 * 백엔드의 get_utc_now()와 유사한 기능을 제공합니다.
 * @returns ISO 8601 형식의 UTC 시간 문자열 (예: "2025-03-28T06:46:44.123Z")
 */
export const getUtcNow = (): Date => {
  return new Date();
};

/**
 * 현재 UTC 시간을 ISO 8601 형식의 문자열로 반환합니다.
 * @returns ISO 8601 형식의 UTC 시간 문자열 (예: "2025-03-28T06:46:44.123Z")
 */
export const getUtcTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * 현재 KST 시간을 Date 객체로 반환합니다.
 * 백엔드의 get_kst_now()와 유사한 기능을 제공합니다.
 * @returns KST 시간대의 Date 객체
 */
export const getKstNow = (): Date => {
  // UTC 시간을 KST로 변환
  return utcToZonedTime(new Date(), TIME_ZONES.KST);
};

/**
 * 날짜 값을 파싱하여 Date 객체로 변환합니다.
 * 다양한 형식의 입력(ISO 문자열, Date 객체, 타임스탬프 등)을 처리할 수 있습니다.
 * @param dateValue - 변환할 날짜 값
 * @returns 변환된 Date 객체 또는 변환 실패 시 null
 */
export const parseDate = (dateValue: DateValueType): Date | null => {
  if (!dateValue) {
    return null;
  }

  try {
    // 이미 Date 객체인 경우
    if (dateValue instanceof Date) {
      return isValid(dateValue) ? dateValue : null;
    }

    // 숫자(타임스탬프)인 경우
    if (typeof dateValue === 'number') {
      const date = new Date(dateValue);
      return isValid(date) ? date : null;
    }

    // 문자열인 경우
    if (typeof dateValue === 'string') {
      // ISO 8601 형식 문자열 처리
      if (dateValue.includes('T') || dateValue.includes('Z')) {
        const date = parseISO(dateValue);
        return isValid(date) ? date : null;
      }

      // MongoDB 형식 문자열 처리 (ISODate("2023-01-01T00:00:00.000Z"))
      if (dateValue.startsWith('ISODate(') && dateValue.endsWith(')')) {
        const isoString = dateValue.substring(9, dateValue.length - 2);
        const date = parseISO(isoString);
        return isValid(date) ? date : null;
      }

      // 일반 문자열 처리
      const date = new Date(dateValue);
      return isValid(date) ? date : null;
    }
  } catch (error) {
    console.error('날짜 파싱 오류:', error);
  }

  return null;
};

/**
 * 날짜를 지정된 형식과 시간대로 포맷팅합니다.
 * 백엔드의 format_datetime()과 유사한 기능을 제공합니다.
 * @param dateValue - 포맷팅할 날짜 값 (ISO 문자열, Date 객체, 타임스탬프 등)
 * @param formatStr - 출력 포맷 (기본값: yyyy-MM-dd HH:mm)
 * @param timeZone - 변환할 시간대 (기본값: KST)
 * @returns 포맷팅된 문자열
 */
export const formatDateTime = (
  dateValue: DateValueType,
  formatStr: string = DATE_FORMATS.DISPLAY.DEFAULT,
  timeZone: TimeZoneType = TIME_ZONES.DEFAULT
): string => {
  if (!dateValue) {
    return '-';
  }

  try {
    const date = parseDate(dateValue);
    if (!date) {
      return '-';
    }

    return formatInTimeZone(date, timeZone, formatStr, { locale: ko });
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error);
    return '-';
  }
};

/**
 * 날짜를 ISO 8601 형식의 문자열로 직렬화합니다.
 * 백엔드의 serialize_datetime()과 유사한 기능을 제공합니다.
 * @param dateValue - 직렬화할 날짜 값
 * @returns ISO 8601 형식의 문자열 또는 null
 */
export const serializeDateTime = (dateValue: DateValueType): string | null => {
  if (!dateValue) {
    return null;
  }

  try {
    const date = parseDate(dateValue);
    if (!date) {
      return null;
    }

    return date.toISOString();
  } catch (error) {
    console.error('날짜 직렬화 오류:', error);
    return null;
  }
};

/**
 * API 요청 데이터에서 날짜 필드를 자동으로 UTC로 변환합니다.
 * @param data - API로 전송할 데이터
 * @param dateFields - 날짜 필드 이름 배열
 * @returns 날짜 필드가 UTC로 변환된 데이터
 */
export const normalizeDateFieldsForApi = <T>(
  data: T | null | undefined,
  dateFields: string[] = ['created_at', 'last_modified_at', 'dateAdded']
): T | null | undefined => {
  if (!data) {
    return data;
  }

  const result = { ...data } as any;

  for (const field of dateFields) {
    if (field in result && result[field]) {
      try {
        const date = parseDate(result[field]);
        if (date) {
          result[field] = date.toISOString();
        }
      } catch (error) {
        console.error(`필드 ${field} 정규화 오류:`, error);
      }
    }
  }

  return result as T;
};

/**
 * API 응답 데이터의 날짜 필드를 자동으로 Date 객체로 변환합니다.
 * @param data - API 응답 데이터 (객체 또는 배열)
 * @param requestUrl - 요청 URL (디버깅 용도)
 * @returns 날짜 필드가 Date 객체로 변환된 데이터
 */
export const normalizeDateFieldsFromApi = <T>(data: T, requestUrl: string = ''): T => {
  if (!data || shouldSkipDateProcessing(requestUrl)) {
    return data;
  }

  // 날짜 필드 후보 (카멜케이스와 스네이크케이스 모두 포함)
  const DATE_FIELD_CANDIDATES = [
    // 카멜케이스
    'createdAt', 'lastModifiedAt', 'updatedAt', 'publishedAt', 
    'expiresAt', 'deletedAt', 'dateAdded', 'dateModified',
    // 스네이크케이스 (백엔드 일관성)
    'created_at', 'last_modified_at', 'updated_at', 'published_at',
    'expires_at', 'deleted_at', 'date_added', 'date_modified'
  ];

  const processValue = (value: any): any => {
    if (!value) {
      return value;
    }

    // 배열 처리
    if (Array.isArray(value)) {
      return value.map(item => processValue(item));
    }

    // 객체 처리
    if (typeof value === 'object' && value !== null) {
      // Date 객체는 그대로 반환
      if (value instanceof Date) {
        return value;
      }

      // 일반 객체 처리
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        // 날짜 필드 후보인 경우 Date 객체로 변환 시도
        if (DATE_FIELD_CANDIDATES.includes(key) && typeof val === 'string') {
          try {
            const date = parseDate(val);
            result[key] = date || val;
          } catch (error) {
            result[key] = val;
          }
        } else {
          // 재귀적으로 처리
          result[key] = processValue(val);
        }
      }
      return result;
    }

    return value;
  };

  return processValue(data);
};

/**
 * 특정 URL 패턴에 대해 날짜 처리를 건너뛸지 결정하는 함수
 * @param url - 요청 URL
 * @returns 날짜 처리를 건너뛸지 여부
 */
export const shouldSkipDateProcessing = (url: string = ''): boolean => {
  const SKIP_PATTERNS = [
    '/auth/', 
    '/config/',
    '/health',
    '/metrics'
  ];
  
  return SKIP_PATTERNS.some(pattern => url.includes(pattern));
};

/**
 * 주어진 타임스탬프로부터 경과된 시간을 한국어로 표시합니다.
 * @param timestamp - 비교할 타임스탬프
 * @returns 경과 시간 문자열 (예: '5초', '10분', '2시간', '3일')
 */
export const timeAgo = (timestamp: DateValueType): string => {
  if (!timestamp) {
    return '-';
  }

  try {
    const date = parseDate(timestamp);
    if (!date) {
      return '-';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffMonth / 12);

    if (diffSec < 60) return `${diffSec}초 전`;
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay < 30) return `${diffDay}일 전`;
    if (diffMonth < 12) return `${diffMonth}개월 전`;
    return `${diffYear}년 전`;
  } catch (error) {
    console.error('timeAgo 오류:', error);
    return '-';
  }
};

// date-fns의 isValid 함수 재내보내기
export { isValid };
