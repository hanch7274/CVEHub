// camelCase to snake_case
const toSnakeCase = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }

  return Object.keys(obj).reduce((acc, key) => {
    // 첫 번째 대문자 앞에도 언더스코어를 추가하되, 문자열 시작이 아닌 경우에만
    const snakeKey = key.replace(/([A-Z])/g, (match, letter, offset) => {
      return (offset > 0 ? '_' : '') + letter.toLowerCase();
    });
    acc[snakeKey] = toSnakeCase(obj[key]);
    return acc;
  }, {});
};

// snake_case to camelCase
const toCamelCase = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }

  return Object.keys(obj).reduce((acc, key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    acc[camelKey] = toCamelCase(obj[key]);
    return acc;
  }, {});
};

export { toSnakeCase, toCamelCase };
