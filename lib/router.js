class Router {
    constructor() {
        this._middlewares = [];
        this._routes = [];
    }

    use(fn) {
        this._middlewares.push(fn);
        return this;
    }

    get(path, ...fns) { return this._addRoute('GET', path, fns); }
    post(path, ...fns) { return this._addRoute('POST', path, fns); }
    put(path, ...fns) { return this._addRoute('PUT', path, fns); }
    delete(path, ...fns) { return this._addRoute('DELETE', path, fns); }
    patch(path, ...fns) { return this._addRoute('PATCH', path, fns); }

    _addRoute(method, path, fns) {
        this._routes.push({ method, path, handlers: fns });
        return this;
    }

    handle(req, res, basePath = '') {
        const url = new URL(req.url, 'http://localhost');
        const localPath = url.pathname.startsWith(basePath)
            ? url.pathname.slice(basePath.length) || '/'
            : '/';

        const route = this._routes.find(r =>
            r.method === req.method && this._matchPath(r.path, localPath)
        );

        if (!route) {
            res.statusCode = 404;
            res.end(`Cannot ${req.method} ${url.pathname}`);
            return;
        }

        req.params = this._extractParams(route.path, localPath);

        const chain = [...this._middlewares, ...route.handlers];
        this._runChain(chain, req, res, 0);
    }

    _matchPath(routePath, actualPath) {
        const rParts = routePath.split('/');
        const aParts = actualPath.split('/');
        if (rParts.length !== aParts.length) return false;
        return rParts.every((part, i) => part.startsWith(':') || part === aParts[i]);
    }

    _extractParams(routePath, actualPath) {
        const rParts = routePath.split('/');
        const aParts = actualPath.split('/');
        const params = {};
        rParts.forEach((part, i) => {
            if (part.startsWith(':')) params[part.slice(1)] = aParts[i];
        });
        return params;
    }

    _runChain(chain, req, res, index) {
        if (index >= chain.length) return;
        chain[index](req, res, () => this._runChain(chain, req, res, index + 1));
    }
}

module.exports = Router;
