// Simple logger utility
const logger = {
  info: (context, message, data) => {
    console.info(`[INFO][${context}] ${message}`, data || '');
  },
  
  warn: (context, message, data) => {
    console.warn(`[WARN][${context}] ${message}`, data || '');
  },
  
  error: (context, message, error) => {
    console.error(`[ERROR][${context}] ${message}`, error || '');
  },
  
  debug: (context, message, data) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG][${context}] ${message}`, data || '');
    }
  }
};

export default logger;
