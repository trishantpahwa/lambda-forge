/**
 * Parses all incoming request data and attaches it to req before any handler runs.
 * Works with both Node's streaming IncomingMessage and Lambda event-based req objects.
 *
 * Added to req:
 *   req.path       — pathname without query string  (/users/42)
 *   req.query      — query string as object          { page: '1' }
 *   req.hostname   — host without port               'localhost'
 *   req.protocol   — 'http' or 'https'
 *   req.body       — parsed body (JSON obj, url-encoded obj, raw string, or null)
 *   req.get(name)  — case-insensitive header lookup
 */
async function parseRequest(req) {
    parseUrl(req);
    req.body = await parseBody(req);
}

function parseUrl(req) {
    const url = new URL(req.url, 'http://localhost');

    req.path     = url.pathname;
    req.query    = Object.fromEntries(url.searchParams);
    req.hostname = (req.headers['host'] || '').split(':')[0];
    req.protocol = req.headers['x-forwarded-proto'] || 'http';

    req.get = (name) => req.headers[name.toLowerCase()];
}

function parseBody(req) {
    // Lambda path: body already buffered by the adapter into req._rawBody
    if ('_rawBody' in req) {
        return Promise.resolve(parseBodyContent(req._rawBody, req.headers['content-type'] || ''));
    }

    // Node.js path: body arrives as a stream
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('error', reject);
        req.on('end', () => {
            resolve(parseBodyContent(Buffer.concat(chunks), req.headers['content-type'] || ''));
        });
    });
}

function parseBodyContent(raw, contentType) {
    if (!raw) return null;
    const str = Buffer.isBuffer(raw) ? raw.toString() : raw;
    if (!str) return null;

    if (contentType.includes('application/json')) {
        try { return JSON.parse(str); } catch { return {}; }
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
        return Object.fromEntries(new URLSearchParams(str));
    }
    return str;
}

module.exports = { parseRequest };
