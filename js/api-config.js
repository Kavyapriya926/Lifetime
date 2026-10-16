window.LIFETIME_API_BASE_URL = '';
window.apiUrl = function (path) {
  const baseUrl = window.LIFETIME_API_BASE_URL.replace(/\/+$/, '');
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
};
