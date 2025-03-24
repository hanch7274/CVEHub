/**
 * 케이스 변환 유틸리티
 * humps 라이브러리를 사용하여 camelCase와 snake_case 간 변환을 처리합니다.
 */
import { camelizeKeys, decamelizeKeys } from 'humps';
import { processApiDates } from './dateUtils';

/**
 * 스네이크 케이스에서 카멜 케이스로 변환 옵션 인터페이스
 */
export interface CaseConverterOptions {
  /** 변환에서 제외할 필드 이름 목록 */
  excludeFields?: string[];
  /** 날짜 필드 자동 변환 여부 */
  processDate?: boolean;
  /** 요청 URL (로깅 및 특수 처리용) */
  requestUrl?: string;
}

/**
 * 스네이크 케이스에서 카멜 케이스로 변환
 * @param data 변환할 데이터
 * @param options 변환 옵션
 * @returns 변환된 데이터
 */
export const snakeToCamel = (data: any, options: CaseConverterOptions = {}): any => {
  const { 
    excludeFields = [],
    processDate = true,
    requestUrl = 'unknown'
  } = options;
  
  // null 또는 undefined인 경우 그대로 반환
  if (data === null || data === undefined) {
    return data;
  }
  
  // Date 객체인 경우 그대로 반환
  if (data instanceof Date) {
    return data;
  }
  
  try {
    // 1. humps 라이브러리로 카멜케이스 변환
    let camelizedData = camelizeKeys(data, (key: string, convert: (key: string) => string) => {
      // 제외 필드 목록에 있는 경우 변환하지 않음
      return excludeFields.includes(key) ? key : convert(key);
    });
    
    // 2. 날짜 필드 자동 타입 변환 처리 (processDate 옵션이 true인 경우)
    if (processDate) {
      // dateUtils.js의 processApiDates 함수 활용
      camelizedData = processApiDates(camelizedData, requestUrl);
    }
    
    return camelizedData;
  } catch (error) {
    console.error('[snakeToCamel] 변환 오류:', error);
    return data; // 오류 발생 시 원본 반환
  }
};

/**
 * 카멜 케이스를 스네이크 케이스로 변환
 * @param data 변환할 데이터
 * @param options 변환 옵션
 * @returns 변환된 데이터
 */
export const camelToSnake = (data: any, options: Omit<CaseConverterOptions, 'processDate'> = {}): any => {
  const { excludeFields = [] } = options;
  
  // null 또는 undefined인 경우 그대로 반환
  if (data === null || data === undefined) {
    return data;
  }
  
  // Date 객체인 경우 그대로 반환
  if (data instanceof Date) {
    return data;
  }
  
  try {
    // humps 라이브러리로 스네이크케이스 변환
    return decamelizeKeys(data, (key: string, convert: (key: string, options?: any) => string, options?: any) => {
      // 제외 필드 목록에 있는 경우 변환하지 않음
      return excludeFields.includes(key) ? key : convert(key, options);
    });
  } catch (error) {
    console.error('[camelToSnake] 변환 오류:', error);
    return data; // 오류 발생 시 원본 반환
  }
};
