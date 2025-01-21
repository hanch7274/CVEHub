// 멘션된 사용자를 하이라이트하는 유틸리티 함수
export const highlightMentions = (content) => {
  if (!content) return '';
  
  // @username 패턴을 찾아서 하이라이트된 스팬으로 변환
  const parts = content.split(/(@\w+)/g);
  
  return parts.map((part, index) => {
    if (part.match(/^@\w+$/)) {
      // 멘션인 경우 하이라이트 처리
      return `<span class="mention">${part}</span>`;
    }
    return part;
  }).join('');
};

// 텍스트에서 멘션된 사용자 목록 추출
export const extractMentions = (content) => {
  if (!content) return [];
  
  const mentions = content.match(/@(\w+)/g) || [];
  return mentions.map(mention => mention.slice(1)); // @ 제거
};
