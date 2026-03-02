/* api.js – Centralized fetch wrapper */
window.API = {
    async request(method, url, body) {
        const token = sessionStorage.getItem('notieos-token');
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        if (token) opts.headers.Authorization = `Bearer ${token}`;
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    },
    get: (url) => API.request('GET', url),
    post: (url, body) => API.request('POST', url, body),
    put: (url, body) => API.request('PUT', url, body),
    patch: (url, body) => API.request('PATCH', url, body),
    delete: (url) => API.request('DELETE', url),
};

window.toast = function (msg, duration = 2800) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._to);
    t._to = setTimeout(() => t.classList.add('hidden'), duration);
};
