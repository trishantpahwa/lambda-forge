const assert = require('assert');
const { describe, it } = require('mocha');
const { EventEmitter } = require('events');
const Router = require('../lib/router');
const { parseRequest } = require('../lib/parser');
const { createHandler } = require('../lib/lambda');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeReq(method, url, headers = {}, rawBody = '') {
    const emitter = new EventEmitter();
    Object.assign(emitter, { method, url, headers, body: '', params: {}, query: {} });
    // Simulate Node's IncomingMessage data/end events
    process.nextTick(() => {
        if (rawBody) emitter.emit('data', Buffer.from(rawBody));
        emitter.emit('end');
    });
    return emitter;
}

function makeRes() {
    const res = { statusCode: 200, _headers: {}, _body: null };
    res.setHeader  = (k, v) => { res._headers[k.toLowerCase()] = v; };
    res.getHeader  = (k)    => res._headers[k.toLowerCase()];
    res.end        = (data) => { res._body = data; };
    res.status     = (code) => { res.statusCode = code; return res; };
    res.set        = (k, v) => { res.setHeader(k, v); return res; };
    res.get        = (k)    => res.getHeader(k);
    res.type       = (ct)   => { res.setHeader('Content-Type', ct); return res; };
    res.json       = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    res.send       = (data) => typeof data === 'object' && data !== null ? res.json(data) : res.end(String(data));
    return res;
}

// ── Router ───────────────────────────────────────────────────────────────────

describe('Router', () => {
    it('matches a GET route', (done) => {
        const router = new Router();
        router.get('/', (req, res) => { res.json({ ok: true }); done(); });
        router.handle(makeReq('GET', '/app/'), makeRes(), '/app');
    });

    it('extracts named params', (done) => {
        const router = new Router();
        router.get('/users/:id', (req, res) => {
            assert.strictEqual(req.params.id, '42');
            done();
        });
        router.handle(makeReq('GET', '/app/users/42'), makeRes(), '/app');
    });

    it('runs middleware before handler', (done) => {
        const router = new Router();
        const order = [];
        router.use((req, res, next) => { order.push('mw'); next(); });
        router.get('/', (req, res) => { assert.deepStrictEqual(order, ['mw']); done(); });
        router.handle(makeReq('GET', '/app/'), makeRes(), '/app');
    });

    it('returns 404 for unmatched route', () => {
        const router = new Router();
        const res = makeRes();
        router.handle(makeReq('GET', '/app/missing'), res, '/app');
        assert.strictEqual(res.statusCode, 404);
    });
});

// ── Parser ───────────────────────────────────────────────────────────────────

describe('parseRequest — URL', () => {
    it('sets req.path without query string', async () => {
        const req = makeReq('GET', '/users/42?page=1');
        await parseRequest(req);
        assert.strictEqual(req.path, '/users/42');
    });

    it('parses query string into req.query', async () => {
        const req = makeReq('GET', '/items?sort=asc&limit=10');
        await parseRequest(req);
        assert.deepStrictEqual(req.query, { sort: 'asc', limit: '10' });
    });

    it('sets req.hostname from Host header', async () => {
        const req = makeReq('GET', '/', { host: 'example.com:3000' });
        await parseRequest(req);
        assert.strictEqual(req.hostname, 'example.com');
    });

    it('defaults req.protocol to http', async () => {
        const req = makeReq('GET', '/');
        await parseRequest(req);
        assert.strictEqual(req.protocol, 'http');
    });

    it('reads req.protocol from X-Forwarded-Proto', async () => {
        const req = makeReq('GET', '/', { 'x-forwarded-proto': 'https' });
        await parseRequest(req);
        assert.strictEqual(req.protocol, 'https');
    });
});

describe('parseRequest — headers', () => {
    it('req.get() returns header case-insensitively', async () => {
        const req = makeReq('GET', '/', { 'content-type': 'application/json' });
        await parseRequest(req);
        assert.strictEqual(req.get('Content-Type'), 'application/json');
        assert.strictEqual(req.get('content-type'), 'application/json');
        assert.strictEqual(req.get('CONTENT-TYPE'), 'application/json');
    });

    it('req.get() returns undefined for missing headers', async () => {
        const req = makeReq('GET', '/');
        await parseRequest(req);
        assert.strictEqual(req.get('Authorization'), undefined);
    });
});

describe('parseRequest — body', () => {
    it('parses a JSON body', async () => {
        const req = makeReq('POST', '/', { 'content-type': 'application/json' }, '{"name":"Alice"}');
        await parseRequest(req);
        assert.deepStrictEqual(req.body, { name: 'Alice' });
    });

    it('parses a URL-encoded body', async () => {
        const req = makeReq('POST', '/', { 'content-type': 'application/x-www-form-urlencoded' }, 'name=Alice&role=admin');
        await parseRequest(req);
        assert.deepStrictEqual(req.body, { name: 'Alice', role: 'admin' });
    });

    it('returns raw string for plain text body', async () => {
        const req = makeReq('POST', '/', { 'content-type': 'text/plain' }, 'hello');
        await parseRequest(req);
        assert.strictEqual(req.body, 'hello');
    });

    it('returns null for an empty body', async () => {
        const req = makeReq('POST', '/', {}, '');
        await parseRequest(req);
        assert.strictEqual(req.body, null);
    });

    it('returns {} for malformed JSON', async () => {
        const req = makeReq('POST', '/', { 'content-type': 'application/json' }, '{bad json}');
        await parseRequest(req);
        assert.deepStrictEqual(req.body, {});
    });
});

// ── Lambda adapter ────────────────────────────────────────────────────────────

function makeV1Event(overrides = {}) {
    return {
        httpMethod: 'GET',
        path: '/hello',
        queryStringParameters: null,
        headers: { 'content-type': 'application/json', host: 'example.com' },
        body: null,
        isBase64Encoded: false,
        ...overrides,
    };
}

function makeV2Event(overrides = {}) {
    return {
        version: '2.0',
        routeKey: 'GET /hello',
        rawPath: '/hello',
        rawQueryString: '',
        headers: { 'content-type': 'application/json', host: 'example.com' },
        requestContext: { http: { method: 'GET', path: '/hello' } },
        body: null,
        isBase64Encoded: false,
        ...overrides,
    };
}

describe('createHandler — API Gateway v1 (REST API)', () => {
    it('routes a GET and returns JSON', async () => {
        const router = new Router();
        router.get('/hello', (req, res) => res.json({ hello: 'world' }));

        const result = await createHandler(router)(makeV1Event(), {});
        assert.strictEqual(result.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(result.body), { hello: 'world' });
    });

    it('parses query string parameters', async () => {
        const router = new Router();
        router.get('/search', (req, res) => res.json(req.query));

        const result = await createHandler(router)(
            makeV1Event({ path: '/search', queryStringParameters: { q: 'test', page: '2' } }), {}
        );
        assert.deepStrictEqual(JSON.parse(result.body), { q: 'test', page: '2' });
    });

    it('parses a JSON body', async () => {
        const router = new Router();
        router.post('/users', (req, res) => res.status(201).json(req.body));

        const result = await createHandler(router)(
            makeV1Event({ httpMethod: 'POST', path: '/users', body: '{"name":"Alice"}' }), {}
        );
        assert.strictEqual(result.statusCode, 201);
        assert.deepStrictEqual(JSON.parse(result.body), { name: 'Alice' });
    });

    it('decodes a base64-encoded body', async () => {
        const router = new Router();
        router.post('/echo', (req, res) => res.send(req.body));

        const result = await createHandler(router)(
            makeV1Event({
                httpMethod: 'POST',
                path: '/echo',
                headers: { 'content-type': 'text/plain' },
                body: Buffer.from('hello').toString('base64'),
                isBase64Encoded: true,
            }), {}
        );
        assert.strictEqual(result.body, 'hello');
    });

    it('returns 404 for unregistered routes', async () => {
        const router = new Router();
        const result = await createHandler(router)(makeV1Event({ path: '/nope' }), {});
        assert.strictEqual(result.statusCode, 404);
    });
});

describe('createHandler — API Gateway v2 (HTTP API)', () => {
    it('routes a GET and returns JSON', async () => {
        const router = new Router();
        router.get('/hello', (req, res) => res.json({ hello: 'world' }));

        const result = await createHandler(router)(makeV2Event(), {});
        assert.strictEqual(result.statusCode, 200);
        assert.deepStrictEqual(JSON.parse(result.body), { hello: 'world' });
    });

    it('parses raw query string', async () => {
        const router = new Router();
        router.get('/search', (req, res) => res.json(req.query));

        const result = await createHandler(router)(
            makeV2Event({
                rawPath: '/search',
                rawQueryString: 'q=test&page=2',
                requestContext: { http: { method: 'GET', path: '/search' } },
            }), {}
        );
        assert.deepStrictEqual(JSON.parse(result.body), { q: 'test', page: '2' });
    });

    it('exposes req.path and req.hostname inside a handler', async () => {
        const router = new Router();
        router.get('/info', (req, res) => res.json({ path: req.path, hostname: req.hostname }));

        const result = await createHandler(router)(
            makeV2Event({ rawPath: '/info', requestContext: { http: { method: 'GET', path: '/info' } } }), {}
        );
        const body = JSON.parse(result.body);
        assert.strictEqual(body.path, '/info');
        assert.strictEqual(body.hostname, 'example.com');
    });

    it('includes isBase64Encoded in the response', async () => {
        const router = new Router();
        router.get('/hello', (req, res) => res.json({}));
        const result = await createHandler(router)(makeV2Event(), {});
        assert.strictEqual(result.isBase64Encoded, false);
    });
});
