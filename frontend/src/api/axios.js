import axios from 'axios';

const api = axios.create({
  baseURL: 'http://cvehub-backend:8000',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

export default api;
