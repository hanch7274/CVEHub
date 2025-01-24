const toCamelCase = (str) => {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace('-', '').replace('_', '')
  );
};

const toSnakeCase = (str) => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

export const camelToSnake = (data) => {
  if (Array.isArray(data)) {
    return data.map((item) => camelToSnake(item));
  }

  if (data !== null && typeof data === 'object') {
    return Object.keys(data).reduce((result, key) => {
      const snakeKey = toSnakeCase(key);
      result[snakeKey] = camelToSnake(data[key]);
      return result;
    }, {});
  }

  return data;
};

export const snakeToCamel = (data) => {
  if (Array.isArray(data)) {
    return data.map((item) => snakeToCamel(item));
  }

  if (data !== null && typeof data === 'object') {
    return Object.keys(data).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      result[camelKey] = snakeToCamel(data[key]);
      return result;
    }, {});
  }

  return data;
}; 