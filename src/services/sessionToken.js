let csrfToken = ''

export function guardarCsrfToken(token) { csrfToken = typeof token === 'string' ? token : '' }
export function obterCsrfToken() { return csrfToken }

export function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(mutating && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    },
  })
}
