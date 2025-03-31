/**
 * CVE 관련 타입 정의 파일
 */

/**
 * CVE 기본 정보 인터페이스
 */
export interface CVEBase {
    id?: string;
    cveId: string;
    title?: string;
    status: string;
    createdAt: string | Date;
    lastModifiedAt?: string | Date;
    severity?: string;
  }
  
  /**
   * CVE 목록 응답 인터페이스
   */
  export interface CVEListResponse {
    items: CVEBase[];
    total: number;
    page: number;
    limit: number;
  }
  
  /**
   * CVE 상세 정보 인터페이스
   */
  export interface CVEDetail extends CVEBase {
    description?: string;
    references: Reference[];
    pocs: PoC[];
    snortRules: SnortRule[];
    modificationHistory: ModificationHistory[];
    createdBy?: string;
    lastModifiedBy?: string;
    comments?: Comment[];
  }
  
  /**
   * 참고자료 인터페이스
   */
  export interface Reference {
    id?: string;
    url: string;
    description?: string;
    addedBy?: string;
    addedAt?: string | Date;
  }
  
  /**
   * PoC (Proof of Concept) 인터페이스
   */
  export interface PoC {
    id?: string;
    code: string;
    language: string;
    description?: string;
    addedBy?: string;
    addedAt?: string | Date;
  }
  
  /**
   * Snort 규칙 인터페이스
   */
  export interface SnortRule {
    id?: string;
    rule: string;
    description?: string;
    addedBy?: string;
    addedAt?: string | Date;
  }
  
  /**
   * 수정 이력 인터페이스
   */
  export interface ModificationHistory {
    id?: string;
    field: string;
    oldValue?: any;
    newValue?: any;
    modifiedBy: string;
    modifiedAt: string | Date;
  }
  
  /**
   * 댓글 인터페이스
   */
  export interface Comment {
    id?: string;
    content: string;
    createdAt: string | Date;
    updatedAt?: string | Date;
    createdBy: string;
    isDeleted?: boolean;
    children?: Comment[];
  }
  
  /**
   * CVE 필터링 옵션 인터페이스
   */
  export interface CVEFilterOptions {
    page?: number;
    rowsPerPage?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    filters?: Record<string, any>;
  }
  
  /**
   * CVE 생성 요청 인터페이스
   */
  export interface CVECreateRequest {
    cveId: string;
    title?: string;
    description?: string;
    status: string;
    severity?: string;
    references?: Reference[];
  }
  
  /**
   * CVE 업데이트 요청 인터페이스
   */
  export interface CVEUpdateRequest {
    title?: string;
    description?: string;
    status?: string;
    severity?: string;
    references?: Reference[];
    pocs?: PoC[];
    snortRules?: SnortRule[];
  }
  
  /**
   * 작업 결과 응답 인터페이스
   */
  export interface OperationResponse {
    success: boolean;
    message: string;
    data?: any;
  }