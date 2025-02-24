// 멘션된 사용자를 하이라이트하는 유틸리티 함수
export const highlightMentions = (content) => {
  if (!content) return '';
  
  // @username 패턴을 찾아서 하이라이트된 스팬으로 변환
  // 한글, 영문, 숫자를 포함하는 패턴으로 수정
  const parts = content.split(/(@[가-힣a-zA-Z0-9]+)/g);
  
  return parts.map((part, index) => {
    if (part.match(/^@[가-힣a-zA-Z0-9]+$/)) {
      // 멘션인 경우 하이라이트 처리
      return `<span class="mention" style="color: #1976d2; font-weight: 500; background-color: rgba(25, 118, 210, 0.08); padding: 2px 4px; border-radius: 4px;">${part}</span>`;
    }
    return part;
  }).join('');
};

// 텍스트에서 멘션된 사용자 목록 추출
export const extractMentions = (content) => {
  if (!content) return [];
  
  const mentions = content.match(/@[가-힣a-zA-Z0-9]+/g) || [];
  return mentions.map(mention => mention.slice(1)); // @ 제거
};
