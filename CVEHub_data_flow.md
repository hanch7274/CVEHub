# CVEHub 프론트엔드-백엔드 데이터 흐름 문서

이 문서는 CVEHub 애플리케이션에서 프론트엔드 요청이 백엔드로 전송되고 다시 프론트엔드에 표시되기까지의 전체 데이터 흐름을 설명합니다. 특히 날짜 필드(`createdAt`, `lastModifiedAt`)의 처리 과정에 초점을 맞추어 설명합니다.

## 1. 데이터 흐름 개요

```
프론트엔드 컴포넌트(React) → 훅(React Query) → 서비스 레이어 → axios 인터셉터 → 
백엔드 API → axios 인터셉터 → 서비스 레이어 → 훅 → 프론트엔드 컴포넌트
```

## 2. 상세 흐름도

### 2.1 프론트엔드에서 백엔드로의 요청 흐름

1. **프론트엔드 컴포넌트(CVEList.jsx)에서 요청 시작**
   - 사용자가 CVE 목록 페이지를 로드하거나 필터링/검색 수행
   - `useCVEList` 훅 호출

2. **React Query Hook(useCVEQuery.js)에서 처리**
   - `useCVEList` 훅이 활성화되며 `queryKey` 생성
   - 캐시된 데이터가 없거나 만료된 경우 서비스 레이어 호출

3. **서비스 레이어(cveService.js)에서 요청 준비**
   - `getCVEs` 메소드가 필터 파라미터를 처리
   - axios API 인스턴스를 통해 HTTP 요청 준비

4. **axios 인터셉터(axios.js)에서 요청 전처리**
   - Request Interceptor가 활성화
   - 인증 토큰 추가
   - 카멜케이스(camelCase)를 스네이크케이스(snake_case)로 변환
   - 날짜 필드 UTC 포맷으로 변환

5. **백엔드 API로 HTTP 요청 전송**
   - `/cves/list` 엔드포인트로 GET 요청 전송
   - 쿼리 파라미터에 페이지네이션, 필터, 검색어 포함

### 2.2 백엔드 처리 과정

1. **백엔드 API 라우터(cve_router.py)에서 요청 수신**
   - FastAPI 라우터가 `/cves/list` 엔드포인트 요청 처리
   - 쿼리 파라미터 추출 및 검증

2. **백엔드 서비스 레이어(cve_service.py)에서 비즈니스 로직 처리**
   - 데이터베이스 쿼리 실행
   - 결과 필터링 및 정렬

3. **응답 생성 및 형식화**
   - 결과를 Pydantic 모델(CVEListResponse)로 변환
   - `created_at`과 `last_modified_at` 필드는 ISO 형식 문자열로 직렬화
   - JSON 응답 생성

### 2.3 백엔드에서 프론트엔드로의 응답 흐름

1. **백엔드 API에서 응답 반환**
   - JSON 형식으로 응답 데이터 반환
   - 스네이크케이스 형식의 필드명(`created_at`, `last_modified_at`)

2. **axios 인터셉터(axios.js)에서 응답 후처리**
   - Response Interceptor가 활성화
   - 스네이크케이스를 카멜케이스로 변환(`created_at` → `createdAt`)
   - 날짜 문자열을 Date 객체로 변환하는 과정:
     - `convertDateStringsToDate` 함수 호출
     - 날짜 관련 필드 자동 감지 및 변환
     - 특히 `createdAt`, `lastModifiedAt` 같은 중요 필드 우선 처리

3. **서비스 레이어(cveService.js)에서 응답 수신**
   - axios 인터셉터를 통해 처리된 응답 수신
   - 응답 데이터 구조 표준화

4. **React Query Hook(useCVEQuery.js)에서 응답 처리**
   - 응답 데이터 캐싱
   - 데이터 유효성 확인 및 로깅
   - 쿼리 상태 업데이트(로딩 완료, 에러 처리 등)

5. **프론트엔드 컴포넌트(CVEList.jsx)에서 표시**
   - 훅으로부터 데이터 및 상태 수신
   - `formatDate` 함수를 통해 날짜 출력 형식화
   - 화면에 데이터 렌더링

## 3. 날짜 필드 처리 과정

### 3.1 백엔드에서의 날짜 형식

백엔드(Python/FastAPI)에서는 날짜를 다음과 같은 형식으로 전송:
```json
{
  "created_at": "2025-03-21T02:27:52.074000",
  "last_modified_at": "2025-03-21T02:27:52.074000"
}
```

### 3.2 프론트엔드에서의 변환 과정

1. **axios 인터셉터에서 스네이크케이스→카멜케이스 변환**
   ```javascript
   // 변환 전
   { "created_at": "2025-03-21T02:27:52.074000" }
   
   // 변환 후
   { "createdAt": "2025-03-21T02:27:52.074000" }
   ```

2. **axios 인터셉터에서 문자열→Date 객체 변환**
   ```javascript
   // 변환 전
   { "createdAt": "2025-03-21T02:27:52.074000" }
   
   // 변환 후
   { "createdAt": Date객체 }
   ```

3. **CVEList.jsx에서의 날짜 형식화**
   ```javascript
   // formatDate 함수 호출
   formatDate(cve.createdAt || cve.created_at)
   
   // formatForDisplay 함수를 통해 지역화된 문자열로 변환
   // 예: "2025-03-21 11:27" (KST 기준)
   ```

## 4. 주요 함수 및 역할

### 4.1 axios.js의 변환 함수

```javascript
// 날짜 문자열을 자동으로 감지하고 Date 객체로 변환하는 함수
function convertDateStringsToDate(data) {
  // 특별히 처리할 날짜 필드 목록
  const CRITICAL_DATE_FIELDS = ['createdAt', 'lastModifiedAt', 'created_at', 'last_modified_at'];
  
  // CRITICAL_DATE_FIELDS 먼저 처리
  CRITICAL_DATE_FIELDS.forEach(dateFieldName => {
    if (result[dateFieldName] && typeof result[dateFieldName] === 'string') {
      // ISO 문자열을 Date 객체로 변환
      result[dateFieldName] = new Date(result[dateFieldName]);
    }
  });
  
  // 그 외 날짜로 추정되는 필드 처리
  // ...
}
```

### 4.2 dateUtils.js의 형식화 함수

```javascript
/**
 * UI 표시용 날짜/시간 포맷팅
 * @param {string|Date|number} dateValue - 포맷팅할 날짜 값
 * @param {string} formatStr - 포맷 문자열 (기본값: yyyy-MM-dd HH:mm)
 * @param {string} timeZone - 시간대 (기본값: KST)
 * @returns {string} 포맷팅된 날짜 문자열
 */
export const formatDate = (dateValue, formatStr = DATE_FORMATS.DISPLAY.DEFAULT, timeZone = TIME_ZONES.KST) => {
  const date = parseDate(dateValue);
  
  if (!date) return '-';
  
  try {
    return formatInTimeZone(date, timeZone, formatStr, { locale: ko });
  } catch (error) {
    return '-';
  }
};

// formatForDisplay 함수를 formatDate로 대체 (하위 호환성 유지)
export const formatForDisplay = formatDate;
```

### 4.3 CVEList.jsx의 표시 함수

```javascript
// 날짜 포맷팅 함수
const formatDate = (dateValue) => {
  // 빈 값 체크
  if (!dateValue) {
    return '-';
  }
  
  // 문자열인 경우 Date 객체로 변환 시도
  if (typeof dateValue === 'string') {
    dateValue = new Date(dateValue);
  }
  
  try {
    // formatForDisplay는 formatDate의 별칭이므로 직접 호출
    return formatForDisplay(dateValue, DATE_FORMATS.DISPLAY.DEFAULT, TIME_ZONES.KST);
  } catch (err) {
    return '-';
  }
};
```

## 5. 문제 해결 지침

날짜 변환 과정에서 문제가 발생하는 경우 다음 단계를 확인하세요:

1. **백엔드 API 응답 확인**
   - 개발자 도구 네트워크 탭에서 원본 응답 데이터 검사
   - `created_at`, `last_modified_at` 필드가 존재하고 유효한 ISO 문자열인지 확인

2. **axios 인터셉터 변환 과정 확인**
   - 콘솔 로그를 통해 `convertDateStringsToDate` 함수의 동작 확인
   - 변환 전/후 데이터 구조와 타입 비교

3. **caseConverter.js 변환 과정 확인**
   - 스네이크케이스→카멜케이스 변환 과정에서 날짜 필드가 올바르게 처리되는지 확인
   - 날짜 문자열→Date 객체 변환이 성공적으로 이루어지는지 확인

4. **컴포넌트에서의 날짜 표시 확인**
   - `formatDate` 또는 `formatForDisplay` 함수에 전달되는 값의 타입 확인
   - 포맷팅 결과가 예상대로 표시되는지 확인

## 6. 알려진 문제 및 해결책

### 6.1 Date 객체 처리 오류

**문제 설명:**
- caseConverter.js에서 Date 객체를 "빈 객체"로 잘못 판단하여 null로 변환하는 문제가 있었습니다.
- 이는 `Object.keys(value).length === 0` 조건 때문이었는데, Date 객체는 열거 가능한 속성이 없어서 이 조건에 해당되었습니다.
- 결과적으로 이미 Date 객체로 변환된 날짜 필드가 다시 null로 변환되어 데이터가 손실되었습니다.

**해결 방법:**
- caseConverter.js 파일에서 Date 객체 처리 로직을 개선했습니다:
  1. Date 객체 인식 로직 추가:
     ```javascript
     // Date 객체인 경우 그대로 유지
     else if (value instanceof Date) {
       if (process.env.NODE_ENV === 'development') {
         console.log(`[caseConverter] '${key}' 이미 Date 객체임, 그대로 유지`);
       }
     }
     ```
  2. 빈 객체 체크 로직 개선:
     ```javascript
     // 빈 객체인 경우 (Date 객체는 제외)
     else if (typeof value === 'object' && value !== null && !(value instanceof Date) && Object.keys(value).length === 0) {
       result[key] = null;
       // ...
     }
     ```

**교훈:**
- JavaScript에서 객체 타입 체크 시 `instanceof`를 사용하여 특정 객체 타입을 정확히 식별해야 합니다.
- `Object.keys(value).length === 0`만으로는 "빈 객체"를 판단하기에 충분하지 않으며, 특수 객체(Date, Map, Set 등)는 별도 처리가 필요합니다.
- 데이터 변환 과정에서 여러 레이어가 관여할 경우, 각 레이어의 책임 범위를 명확히 정의하고 중복 처리를 방지해야 합니다.

### 6.2 변환 과정의 중복 문제

**문제 설명:**
- 백엔드에서 받은 날짜 문자열이 프론트엔드에서 여러 번 변환되는 과정에서 문제가 발생할 수 있습니다:
  1. caseConverter.js: 스네이크 케이스 → 카멜 케이스 변환 과정에서 날짜 문자열 → Date 객체로 변환
  2. axios.js: convertDateStringsToDate 함수에서 다시 날짜 필드 처리 시도
  3. 컴포넌트: formatDate 함수에서 추가 변환 및 포맷팅 시도

**해결 방법:**
- 각 레이어의 책임을 명확히 정의:
  1. caseConverter.js: 케이스 변환 및 기본 타입 변환 담당
  2. axios.js: 네트워크 요청/응답 처리 및 전역 인터셉터 담당
  3. dateUtils.js: 날짜 포맷팅 및 표시 담당
- 날짜 변환 로직을 중앙화하여 중복 처리 방지
- 각 단계에서 타입 체크를 강화하여 이미 변환된 데이터는 다시 처리하지 않도록 함

**권장 사항:**
- 날짜 처리 로직을 dateUtils.js에 집중시키고, 다른 모듈에서는 이 유틸리티 함수를 호출하도록 구조화
- 개발 환경에서 상세 로깅을 활성화하여 데이터 변환 과정을 추적하기 쉽게 함
- 타입 체크를 강화하여 예상치 못한 타입 변환 방지

## 7. 향후 개선 방안

1. **강력한 타입 검사**
   - TypeScript 도입으로 타입 안정성 강화
   - 인터페이스 정의로 API 응답 형식 명확화

2. **일관된 데이터 변환 레이어**
   - 케이스 변환 및 날짜 변환을 통합된 레이어에서 처리
   - 서비스 레이어와 컴포넌트 간 데이터 형식 표준화

3. **디버깅 도구 강화**
   - 데이터 흐름 추적을 위한 모니터링 시스템 구축
   - 날짜 변환 문제를 자동으로 감지하고 경고하는 메커니즘 추가

## 8. 참고 사항

- 모든 API 엔드포인트는 일관된 날짜 형식을 사용합니다.
- axios 인터셉터는 모든 API 호출에 적용됩니다.
- 날짜 시간대는 기본적으로 KST(한국 표준시)로 표시됩니다.
- 백엔드는 날짜를 항상 UTC로 저장하고 ISO 형식으로 반환합니다.