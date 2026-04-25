const assert = require('assert');
const { describe, it } = require('mocha');
const Router = require('../lib/router');

describe('Router', () => {
    function makeReq(method, url) {
        return { method, url, headers: {}, body: '', params: {}, query: {} };
    }

    function makeRes() {
        const res = { statusCode: 200, _headers: {}, _body: null };
        res.setHeader = (k, v) => { res._headers[k] = v; };
        res.end = (data) => { res._body = data; };
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => { res._headers['Content-Type'] = 'application/json'; res.end(JSON.stringify(data)); };
        res.send = (data) => typeof data === 'object' ? res.json(data) : res.end(String(data));
        return res;
    }

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
