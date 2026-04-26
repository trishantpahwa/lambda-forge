module.exports = {
    routes() {
        return `const { Router } = require('lambda-forge');
const controllers = require('./controllers');
const { logger } = require('./middleware');

const router = new Router();

router.use(logger);

router.get('/', controllers.index);

module.exports = router;
`;
    },

    middleware() {
        return `const logger = (req, res, next) => {
    console.log(\`\${new Date().toISOString()} \${req.method} \${req.url}\`);
    next();
};

module.exports = { logger };
`;
    },

    controllers() {
        return `const index = async (req, res) => {
    res.json({ message: 'Hello from lambda-forge!' });
};

module.exports = { index };
`;
    },

    handler(appName) {
        return `const { createHandler } = require('lambda-forge');
const router = require('./routes');

module.exports.handler = createHandler(router);
`;
    },

    models() {
        return `module.exports = {};
`;
    },

    utils() {
        return `module.exports = {};
`;
    },

    constants() {
        return `module.exports = {};
`;
    },

    test(projectName) {
        return `const assert = require('assert');
const { describe, it } = require('mocha');

describe('${projectName}', () => {
    it('should run', () => {
        assert.ok(true);
    });
});
`;
    },

    packageJson(projectName) {
        return JSON.stringify({
            name: projectName,
            version: '1.0.0',
            description: '',
            scripts: {
                start: 'forge serve',
                test: 'mocha'
            },
            dependencies: {
                'lambda-forge': '^1.0.0'
            },
            devDependencies: {
                mocha: '^10.0.0'
            }
        }, null, 2) + '\n';
    },
};
