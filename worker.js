export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== '/api' && !requestUrl.pathname.startsWith('/api/')) {
      if (requestUrl.pathname === '/admin' || requestUrl.pathname === '/admin/') {
        requestUrl.pathname = '/admin.html';
        return env.ASSETS.fetch(new Request(requestUrl, request));
      }
      return env.ASSETS.fetch(request);
    }

    if (!env.API_ORIGIN) {
      return Response.json(
        { success: false, message: 'The backend API origin is not configured.' },
        { status: 503 }
      );
    }

    let apiOrigin;
    try {
      apiOrigin = new URL(env.API_ORIGIN);
    } catch {
      return Response.json(
        { success: false, message: 'The backend API origin is invalid.' },
        { status: 500 }
      );
    }
    if (
      !['http:', 'https:'].includes(apiOrigin.protocol) ||
      apiOrigin.username ||
      apiOrigin.password ||
      apiOrigin.pathname !== '/' ||
      apiOrigin.search ||
      apiOrigin.hash
    ) {
      return Response.json(
        { success: false, message: 'The backend API origin is invalid.' },
        { status: 500 }
      );
    }

    const targetUrl = new URL(requestUrl.pathname + requestUrl.search, apiOrigin);
    return fetch(new Request(targetUrl, request));
  },
};
