```
  _                 _         _           __
 | |               | |       | |         / _|
 | | __ _ _ __ ___ | |__   __| | __ _   | |_ ___  _ __ __ _  ___
 | |/ _` | '_ ` _ \| '_ \ / _` |/ _` |  |  _/ _ \| '__/ _` |/ _ \
 | | (_| | | | | | | |_) | (_| | (_| |  | || (_) | | | (_| |  __/
 |_|\__,_|_| |_| |_|_.__/ \__,_|\__,_|  |_| \___/|_|  \__, |\___|
                                                         __/ |
                                                        |___/
```

<div align="center">

[![npm version](https://img.shields.io/npm/v/lambda-forge.svg?style=flat-square)](https://www.npmjs.com/package/lambda-forge)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/trishantpahwa/lambda-forge/pulls)

**A zero-dependency framework for building microservices on AWS Lambda.**  
Scaffold, develop locally, and deploy — without ever touching a config file.

[Quick Start](#quick-start) · [CLI Reference](#cli-reference) · [Router API](#router-api) · [Deploy to Lambda](#deploying-to-aws-lambda) · [Contributing](#contributing)

</div>

---

## Table of Contents

- [What is lambda-forge?](#what-is-lambda-forge)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Writing Your App](#writing-your-app)
  - [Routes](#routes)
  - [Middleware](#middleware)
  - [Controllers](#controllers)
  - [Models](#models)
  - [Commons](#commons)
- [CLI Reference](#cli-reference)
- [Router API](#router-api)
- [Deploying to AWS Lambda](#deploying-to-aws-lambda)
- [Contributing](#contributing)
- [License](#license)

---

## What is lambda-forge?

lambda-forge is a lightweight CLI and runtime framework for building microservices meant to run on **AWS Lambda**. Each "app" in your project maps to a single Lambda function — independently deployable, independently scalable.

The local development server mirrors the Lambda routing behaviour exactly, so what works on your machine works in the cloud.

```
forge create          →   scaffold a new project in seconds
npm start             →   local server with live app routing
npm run deploy        →   ship each app as its own Lambda function
```

No Express. No bloat. Zero runtime dependencies.

---

## Features

- **CLI scaffolding** — interactive `forge create` generates a full project in one command
- **Per-app Lambda functions** — each app directory becomes an independent microservice
- **Built-in Router** — HTTP routing with named params and middleware chains, built on native `http`
- **Per-app isolated servers** — `forge serve` starts each app on its own port, mirroring Lambda's isolated runtime
- **Built-in test runner** — `forge test` runs your Mocha test suite without any extra config
- **Zero runtime dependencies** — the entire framework runs on Node.js built-ins
- **Convention over configuration** — predictable file layout, no config files required

---

## Installation

Install the CLI globally:

```bash
npm install -g lambda-forge
```

Verify the install:

```bash
forge --help
```

---

## Quick Start

**1. Create a new project**

```bash
forge create
```

```
  Welcome to lambda-forge!

  Project name: my-api
  First app name: users
```

**2. Move into the project and install dependencies**

```bash
cd my-api
npm install
```

**3. Start the local server**

```bash
npm start
# or: forge serve
```

```
  lambda-forge local server running

    users                http://localhost:3000
```

**4. Hit your endpoint**

```bash
curl http://localhost:3000/
# {"message":"Hello from lambda-forge!"}
```

Each app runs on its own port — add more apps under `apps/` and they'll each get the next port automatically (`3001`, `3002`, …).

---

## Project Structure

```
my-api/
├── apps/
│   └── users/                  # one directory = one Lambda function
│       ├── routes.js           # URL routing
│       ├── middleware.js       # request/response middleware
│       ├── controllers.js      # request handlers
│       └── models.js           # data models
├── commons/
│   ├── utils.js                # shared utilities
│   └── constants.js            # shared constants
├── test/
│   └── index.js                # test suite (mocha)
└── package.json
```

Adding a second app is just adding a new directory under `apps/`. The server picks it up automatically on the next restart. Each app gets its own port, assigned sequentially from the base port.

```
apps/
├── users/       →   http://localhost:3000
├── orders/      →   http://localhost:3001
└── products/    →   http://localhost:3002
```

---

## Writing Your App

### Routes

`apps/<name>/routes.js` is the entry point for an app. Register routes on a `Router` instance and export it.

```js
const { Router } = require('lambda-forge');
const controllers = require('./controllers');
const { logger } = require('./middleware');

const router = new Router();

router.use(logger);

router.get('/', controllers.list);
router.get('/:id', controllers.get);
router.post('/', controllers.create);
router.put('/:id', controllers.update);
router.delete('/:id', controllers.remove);

module.exports = router;
```

<details>
<summary>Supported HTTP methods</summary>

| Method | Router call |
|--------|-------------|
| GET | `router.get(path, ...handlers)` |
| POST | `router.post(path, ...handlers)` |
| PUT | `router.put(path, ...handlers)` |
| PATCH | `router.patch(path, ...handlers)` |
| DELETE | `router.delete(path, ...handlers)` |

</details>

---

### Middleware

`apps/<name>/middleware.js` exports functions with the `(req, res, next)` signature. Register them with `router.use()` and they run before every route handler in that app.

```js
const logger = (req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
};

const auth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
};

module.exports = { logger, auth };
```

You can also pass middleware inline on individual routes:

```js
router.get('/admin', auth, controllers.admin);
```

---

### Controllers

`apps/<name>/controllers.js` exports handler functions. Each receives the augmented `req` and `res` objects.

```js
const list = async (req, res) => {
    // req.query  — parsed query string   { page: '1' }
    // req.params — named URL params      { id: '42' }
    // req.body   — parsed request body   { name: 'Alice' }

    const users = await getUsers(req.query);
    res.json(users);
};

const get = async (req, res) => {
    const user = await getUserById(req.params.id);
    if (!user) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(user);
};

const create = async (req, res) => {
    const user = await createUser(req.body);
    res.status(201).json(user);
};

module.exports = { list, get, create };
```

<details>
<summary>Response helper reference</summary>

| Helper | Description |
|--------|-------------|
| `res.json(data)` | Send a JSON response (`Content-Type: application/json`) |
| `res.send(data)` | Send a string or auto-detect JSON for objects |
| `res.status(code)` | Set the HTTP status code, returns `res` for chaining |

Example chain:

```js
res.status(422).json({ error: 'Validation failed', fields: ['email'] });
```

</details>

---

### Models

`apps/<name>/models.js` is where your data layer lives. No conventions enforced — wire up any database, ORM, or external API here.

```js
const { DB_URL } = require('../../commons/constants');

const findAll = async (filters) => {
    // query your database
};

const findById = async (id) => {
    // query your database
};

module.exports = { findAll, findById };
```

---

### Commons

Shared code goes in the `commons/` directory — reusable across all apps.

```
commons/
├── utils.js      # helper functions
└── constants.js  # environment config, shared values
```

```js
// commons/constants.js
module.exports = {
    DB_URL: process.env.DB_URL || 'mongodb://localhost:27017/mydb',
    PAGE_SIZE: 20,
};
```

```js
// commons/utils.js
const paginate = (items, page, size) =>
    items.slice((page - 1) * size, page * size);

module.exports = { paginate };
```

---

## CLI Reference

```
Usage: forge <command> [options]

Commands:
  create         Create a new lambda-forge project
  serve          Start local development server
  test           Run project tests with Mocha

Options for serve:
  --port <port>  Base port (default: 3000, each app gets the next port)
```

| Command | Description |
|---------|-------------|
| `forge create` | Interactively scaffold a new project |
| `forge serve` | Start each app on its own port from 3000 |
| `forge serve --port 8000` | Start from a custom base port (`8000`, `8001`, …) |
| `PORT=8000 forge serve` | Alternatively set the base port via env variable |
| `forge test` | Run the project test suite with Mocha |

---

## Router API

The `Router` class is the only export from `lambda-forge`.

```js
const { Router } = require('lambda-forge');
const router = new Router();
```

### Route registration

```js
router.get(path, ...handlers)
router.post(path, ...handlers)
router.put(path, ...handlers)
router.patch(path, ...handlers)
router.delete(path, ...handlers)
```

- `path` — a string like `'/'`, `'/users'`, or `'/users/:id'`
- `handlers` — one or more `(req, res, next) => void` functions executed in order

### Middleware registration

```js
router.use(fn)
```

Runs `fn` before every route handler in the router. Calling `next()` advances to the next middleware or the matched route handler.

### Named URL parameters

Prefix a path segment with `:` to capture it as a named parameter:

```js
router.get('/users/:id/posts/:postId', (req, res) => {
    const { id, postId } = req.params;
    res.json({ userId: id, postId });
});
```

---

## Deploying to AWS Lambda

Each app in `apps/` is designed to become its own Lambda function. To deploy:

**1. Add `serverless-http` to your project**

```bash
npm install serverless-http
```

**2. Create a handler file for each app**

```js
// apps/users/handler.js
const serverless = require('serverless-http');
const http = require('http');
const router = require('./routes');

const server = http.createServer((req, res) => {
    router.handle(req, res);
});

module.exports.handler = serverless(server);
```

> Full Lambda adapter support is on the roadmap. In the meantime, `serverless-http` wraps any Node.js HTTP app for API Gateway with minimal setup.

**3. Configure your deployment tool**

lambda-forge is compatible with any AWS deployment tool:

<details>
<summary>AWS SAM</summary>

```yaml
# template.yaml
Resources:
  UsersFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: apps/users/handler.handler
      Runtime: nodejs20.x
      Events:
        Api:
          Type: Api
          Properties:
            Path: /users/{proxy+}
            Method: ANY
```

</details>

<details>
<summary>Serverless Framework</summary>

```yaml
# serverless.yml
functions:
  users:
    handler: apps/users/handler.handler
    events:
      - http:
          path: /users/{proxy+}
          method: ANY
```

</details>

<details>
<summary>AWS CDK</summary>

```js
// lib/stack.js
const { NodejsFunction } = require('aws-cdk-lib/aws-lambda-nodejs');

new NodejsFunction(this, 'UsersFunction', {
    entry: 'apps/users/handler.js',
    handler: 'handler',
});
```

</details>

---

## Contributing

Contributions are welcome.

```bash
# clone
git clone https://github.com/trishantpahwa/lambda-forge.git
cd lambda-forge

# install dev dependencies
npm install

# run tests
npm test
```

Please open an issue before submitting a pull request for large changes.

---

## License

[Apache 2.0](LICENSE) — © [Trishant Pahwa](https://github.com/trishantpahwa)
