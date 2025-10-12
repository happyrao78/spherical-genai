import axios from 'axios';

export const nodeAPI = axios.create({
  baseURL: import.meta.env.VITE_NODE_API_URL,
});

export const pythonAPI = axios.create({
  baseURL: import.meta.env.VITE_PYTHON_API_URL,
});

// Add token to requests
nodeAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

pythonAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});