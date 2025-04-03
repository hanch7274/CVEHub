const ANIMAL_EMOJIS = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐙', '🐵'
];

export const getAnimalEmoji = (username) => {
  // 사용자 이름을 기반으로 일관된 이모지를 반환
  const charSum = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return ANIMAL_EMOJIS[charSum % ANIMAL_EMOJIS.length];
};

export const getInitials = (name) => {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase();
};
