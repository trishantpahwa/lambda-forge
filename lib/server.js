const http = require('http');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { parseRequest } = require('./parser');

// Redirect require('lambda-press') in loaded app files to this running package,
// so projects work without needing lambda-press published or linked in node_modules.
const _resolveFilename = Module._resolveFilename.bind(Module);
Module._resolveFilename = (request, parent, isMain, options) => {
    if (request === 'lambda-press') return require.resolve('./index');
    return _resolveFilename(request, parent, isMain, options);
};

module.exports = function serve(args = []) {
    const portIndex = args.indexOf('--port');
    const basePort = portIndex !== -1 && args[portIndex + 1]
        ? parseInt(args[portIndex + 1], 10)
        : parseInt(process.env.PORT, 10) || 3000;

    const appsDir = path.resolve(process.cwd(), 'apps');

    if (!fs.existsSync(appsDir)) {
        console.error('  Error: No "apps" directory found.');
        console.error('  Make sure you are in a lambda-press project directory.\n');
        process.exit(1);
    }

    const appDirs = fs.readdirSync(appsDir).filter(name =>
        fs.statSync(path.join(appsDir, name)).isDirectory()
    );

    if (appDirs.length === 0) {
        console.warn('  Warning: No apps found in the "apps" directory.\n');
        return;
    }

    console.log('\n  lambda-press local server running\n');

    appDirs.forEach((appName, index) => {
        const port = basePort + index;
        const routesPath = path.join(appsDir, appName, 'routes.js');

        if (!fs.existsSync(routesPath)) {
            console.warn(`  Warning: No routes.js found for app "${appName}"`);
            return;
        }

        let router;
        try {
            router = require(routesPath);
        } catch (err) {
            console.error(`  Error loading app "${appName}": ${err.message}`);
            return;
        }

        const server = http.createServer(async (req, res) => {
            augmentResponse(res);
            await parseRequest(req);
            router.handle(req, res);
        });

        server.listen(port, () => {
            console.log(`    ${appName.padEnd(20)} http://localhost:${port}`);
        });

        server.on('error', err => {
            console.error(`  Error starting server for "${appName}" on port ${port}: ${err.message}`);
        });
    });

    process.on('listening', () => console.log(''));
};

function augmentResponse(res) {
    res.status = (code)          => { res.statusCode = code; return res; };
    res.set    = (header, value) => { res.setHeader(header, value); return res; };
    res.get    = (header)        => res.getHeader(header);
    res.type   = (ct)            => { res.setHeader('Content-Type', ct); return res; };
    res.json   = (data)          => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };
    res.send   = (data)          => {
        if (data !== null && typeof data === 'object') {
            res.json(data);
        } else {
            res.end(String(data));
        }
    };
}
