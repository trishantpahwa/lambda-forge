const { parseRequest } = require('./parser');

/**
 * Wraps a Router into an AWS Lambda handler compatible with:
 *   - API Gateway REST API  (payload format v1)
 *   - API Gateway HTTP API  (payload format v2)
 *
 * Usage (apps/<name>/handler.js):
 *   const { createHandler } = require('lambda-forge');
 *   const router = require('./routes');
 *   module.exports.handler = createHandler(router);
 */
function createHandler(router) {
    return async (event, context) => {
        const req = fromLambdaEvent(event);
        const { res, response } = createLambdaResponse();

        try {
            await parseRequest(req);
            router.handle(req, res);
            return await response;
        } catch (err) {
            return {
                statusCode: 500,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ error: 'Internal Server Error' }),
                isBase64Encoded: false,
            };
        }
    };
}

// ── Event → req ───────────────────────────────────────────────────────────────

function fromLambdaEvent(event) {
    const v2 = event.version === '2.0';

    const method = v2
        ? event.requestContext.http.method
        : event.httpMethod;

    const rawPath = v2 ? event.rawPath : event.path;

    const rawQuery = v2
        ? (event.rawQueryString || '')
        : queryObjToString(event.queryStringParameters);

    const url = rawQuery ? `${rawPath}?${rawQuery}` : rawPath;

    // Normalise headers to lowercase keys
    const headers = {};
    for (const [k, v] of Object.entries(event.headers || {})) {
        headers[k.toLowerCase()] = v;
    }

    const rawBody = event.body
        ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body)
        : null;

    return { method, url, headers, _rawBody: rawBody, params: {}, query: {} };
}

function queryObjToString(params) {
    if (!params) return '';
    return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}

// ── res → Lambda response ─────────────────────────────────────────────────────

function createLambdaResponse() {
    let resolve;
    let settled = false;

    const response = new Promise(r => { resolve = r; });

    const res = { statusCode: 200, _headers: {} };

    const settle = (body) => {
        if (settled) return;
        settled = true;
        resolve({
            statusCode: res.statusCode,
            headers: res._headers,
            body: body ?? '',
            isBase64Encoded: false,
        });
    };

    res.setHeader = (k, v)   => { res._headers[k.toLowerCase()] = v; };
    res.getHeader = (k)      => res._headers[k.toLowerCase()];
    res.end       = (data)   => settle(data);
    res.status    = (code)   => { res.statusCode = code; return res; };
    res.set       = (k, v)   => { res.setHeader(k, v); return res; };
    res.get       = (k)      => res.getHeader(k);
    res.type      = (ct)     => { res.setHeader('Content-Type', ct); return res; };
    res.json      = (data)   => {
        res.setHeader('Content-Type', 'application/json');
        settle(JSON.stringify(data));
    };
    res.send      = (data)   => {
        if (data !== null && typeof data === 'object') {
            res.json(data);
        } else {
            settle(String(data));
        }
    };

    return { res, response };
}

module.exports = { createHandler };
