export const formatDate = (dateString) => {
  if (!dateString) return '';
  
  try {
    console.log('Input dateString:', dateString);
    
    // UTC 시간을 KST로 변환 (UTC+9)
    const date = new Date(dateString);
    console.log('Parsed date object:', date.toString());
    console.log('Date in ISO:', date.toISOString());
    console.log('Date in local timezone:', date.toLocaleString());
    
    if (isNaN(date.getTime())) return '날짜 오류';

    // KST 기준으로 현재 시간 설정
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000; // 9시간을 밀리초로 변환
    
    // UTC 시간에 9시간을 더해 KST로 변환
    const kstDate = new Date(date.getTime() + kstOffset);
    const kstNow = new Date(now.getTime() + kstOffset);
    
    console.log('KST date:', kstDate.toLocaleString());
    console.log('KST now:', kstNow.toLocaleString());
    
    const diff = kstNow - kstDate;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    // 1일 이내인 경우
    if (days < 1) {
      if (minutes < 1) return '방금 전';
      if (hours < 1) return `${minutes}분 전`;
      return `${hours}시간 전`;
    }
    
    // 1일 이상인 경우 날짜와 시간 표시
    const options = { 
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul'
    };
    
    const result = new Date(dateString).toLocaleString('ko-KR', options).replace(/\./g, '-').replace(/-$/, '');
    console.log('Final formatted result:', result);
    return result;
  } catch (error) {
    console.error('Date formatting error:', error);
    return '날짜 오류';
  }
};
