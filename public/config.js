// ========== CONFIGURATION ==========
// Auto-detect environment and set API base URL
const API_BASE_URL = (() => {
	// If we're on Fly.io (production), use relative URLs
	if (window.location.hostname.includes('fly.dev')) {
		return '';
	}
	// If we're on localhost, use localhost:4000
	if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
		return 'http://localhost:4000';
	}
	// Default to relative URLs for other production environments
	return '';
})();

// Helper function to build full API URLs
function apiUrl(endpoint) {
	if (API_BASE_URL) {
		return `${API_BASE_URL}${endpoint}`;
	}
	return endpoint;
}

// Backward compatibility: rewrite hardcoded localhost requests to relative
(function patchFetchForLocalhost() {
	try {
		const originalFetch = window.fetch.bind(window);
		window.fetch = (input, init) => {
			try {
							if (typeof input === 'string' && input.startsWith('http://localhost:8080')) {
				const rewritten = input.replace('http://localhost:8080', 'http://localhost:4000');
				return originalFetch(rewritten, init);
			}
			} catch (_) {}
			return originalFetch(input, init);
		};
	} catch (_) {}
})();

console.log('API Base URL:', API_BASE_URL);
console.log('Environment:', window.location.hostname.includes('fly.dev') ? 'Production (Fly.io)' : 'Development (Local)');
