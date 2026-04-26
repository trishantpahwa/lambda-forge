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

[Quick Start](#quick-start) · [CLI Reference](#cli-reference) · [Router API](#router-api) · [Request & Response](#request--response) · [Deploy to Lambda](#deploying-to-aws-lambda) · [Debugging](#debugging) · [Contributing](#contributing)

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
  - [Handler](#handler)
- [CLI Reference](#cli-reference)
- [Router API](#router-api)
- [Request & Response](#request--response)
- [Deploying to AWS Lambda](#deploying-to-aws-lambda)
- [Debugging](#debugging)
- [Contributing](#contributing)
- [License](#license)

---

## What is lambda-forge?

lambda-forge is a lightweight CLI and runtime framework for building microservices meant to run on **AWS Lambda**. Each "app" in your project maps to a single Lambda function — independently deployable, independently scalable.

The local development server mirrors the Lambda routing behaviour exactly, so what works on your machine works in the cloud.

```
forge create          →   scaffold a new project in seconds
npm start             →   local server with live reload on file change
npm run deploy        →   ship each app as its own Lambda function
```

No Express. No bloat. Zero runtime dependencies on Lambda.

---

## Features

- **CLI scaffolding** — interactive `forge create` generates a full project in one command
- **Per-app Lambda functions** — each app directory becomes an independent microservice
- **Built-in Router** — HTTP routing with named params, multi-level paths, and middleware chains
- **Live reload** — `forge serve` watches `apps/` and `commons/` and restarts on any file change
- **Per-app isolated servers** — each app runs on its own port, mirroring Lambda's isolated runtime
- **Built-in test runner** — `forge test` runs your Mocha test suite without any extra config
- **Zero Lambda runtime dependencies** — the framework itself is bundled into the deployment zip
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

Each app runs on its own port — add more apps under `apps/` and they'll each get the next port automatically (`3001`, `3002`, …). The server watches for file changes and restarts automatically.

---

## Project Structure

```
my-api/
├── apps/
│   └── users/                  # one directory = one Lambda function
│       ├── routes.js           # URL routing
│       ├── middleware.js       # request/response middleware
│       ├── controllers.js      # request handlers
│       ├── models.js           # data models
│       └── handler.js          # Lambda entry point (auto-generated)
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
    const token = req.get('authorization');
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

Pass an error to `next(err)` to immediately send a 500 response and stop the chain:

```js
const validate = (req, res, next) => {
    if (!req.body.name) return next(new Error('name is required'));
    next();
};
```

---

### Controllers

`apps/<name>/controllers.js` exports handler functions. Each receives the augmented `req` and `res` objects.

```js
const list = async (req, res) => {
    // req.query  — parsed query string     { page: '1' }
    // req.params — named URL params        { id: '42' }
    // req.body   — parsed request body     { name: 'Alice' }
    // req.get()  — case-insensitive header lookup

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

const update = async (req, res) => {
    const apiKey = req.get('x-api-key');   // case-insensitive header read
    if (!apiKey) {
        res.status(401).json({ error: 'API key required' });
        return;
    }
    const updated = await updateUser(req.params.id, req.body);
    res.json(updated);
};

module.exports = { list, get, create, update };
```

<details>
<summary>Response helper reference</summary>

| Helper | Description |
|--------|-------------|
| `res.json(data)` | Send a JSON response (`Content-Type: application/json`) |
| `res.send(data)` | Send a string, or auto-detect JSON for objects |
| `res.status(code)` | Set the HTTP status code — returns `res` for chaining |
| `res.set(header, value)` | Set a response header — returns `res` for chaining |
| `res.type(contentType)` | Set `Content-Type` — returns `res` for chaining |

Example chains:

```js
res.status(422).json({ error: 'Validation failed', fields: ['email'] });
res.status(201).set('Location', '/users/42').json(user);
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

### Handler

`apps/<name>/handler.js` is the Lambda entry point. `forge create` generates it automatically — you rarely need to touch it.

```js
const { createHandler } = require('lambda-forge');
const router = require('./routes');

module.exports.handler = createHandler(router);
```

`createHandler` accepts both API Gateway payload formats (v1 REST API and v2 HTTP API) and translates them into the same `req`/`res` interface your routes already use.

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

| Command | Description |
|---------|-------------|
| `forge create` | Interactively scaffold a new project |
| `forge serve` | Start each app on its own port from 3000, with live reload |
| `forge serve --port 8000` | Start from a custom base port (`8000`, `8001`, …) |
| `forge test` | Run the project test suite with Mocha |
| `forge deploy` | Deploy all apps to AWS Lambda |
| `forge logs <app>` | Fetch recent CloudWatch logs for a deployed app |
| `forge logs <app> --tail` | Follow logs in real time (polls every 2 s) |
| `forge invoke <app>` | Invoke a deployed function and print the response |
| `forge invoke <app> --data '<json>'` | Invoke with a custom event payload |

**Shared options for `deploy`, `logs`, and `invoke`:**

```
--access-key <key>    AWS access key ID
--secret-key <secret> AWS secret access key
--region <region>     AWS region (default: us-east-1)
```

**Additional `serve` options:**

```
--port <port>         Base port for the first app (default: 3000)
```

**Additional `logs` options:**

```
--tail, -f            Follow — poll for new entries every 2 s
--since <minutes>     How far back to look (default: 60)
--filter <pattern>    Only show lines matching this pattern
```

**Additional `deploy` options:**

```
--role <arn>          IAM execution role ARN (auto-created if omitted)
```

**Additional `invoke` options:**

```
--data <json>         Event payload (default: GET / API Gateway v2 event)
```

---

## Router API

`lambda-forge` exports two values:

```js
const { Router, createHandler } = require('lambda-forge');
```

### Route registration

```js
const router = new Router();

router.get(path, ...handlers)
router.post(path, ...handlers)
router.put(path, ...handlers)
router.patch(path, ...handlers)
router.delete(path, ...handlers)
```

- `path` — a string like `'/'`, `'/users'`, `'/users/:id'`, or `'/posts/:postId/comments/:commentId'`
- `handlers` — one or more `(req, res, next) => void` functions executed in order

### Middleware registration

```js
router.use(fn)
```

Runs `fn` before every route handler in the router. Call `next()` to advance, `next(err)` to abort with a 500.

### Named URL parameters

Prefix any path segment with `:` to capture it as a named parameter. Parameters are available on `req.params`.

```js
router.get('/users/:id/posts/:postId', (req, res) => {
    const { id, postId } = req.params;
    res.json({ userId: id, postId });
});
```

### Path matching rules

| Rule | Example |
|------|---------|
| Exact segments match literally | `/users` only matches `/users` |
| `:param` matches any non-empty segment | `/:id` matches `/42` but not `/` |
| Trailing slashes are normalized | `/users/` and `/users` match the same routes |
| Multi-level params work | `/posts/:postId/comments/:commentId` |

---

## Request & Response

### Request object (`req`)

| Property | Type | Description |
|----------|------|-------------|
| `req.method` | `string` | HTTP method — `'GET'`, `'POST'`, etc. |
| `req.url` | `string` | Raw URL including query string |
| `req.path` | `string` | Pathname without query string — `/users/42` |
| `req.params` | `object` | Named URL parameters — `{ id: '42' }` |
| `req.query` | `object` | Parsed query string — `{ page: '1', sort: 'asc' }` |
| `req.body` | `object \| string \| null` | Parsed request body (see below) |
| `req.headers` | `object` | All headers, keys lowercased |
| `req.hostname` | `string` | Host without port — `'example.com'` |
| `req.protocol` | `string` | `'http'` or `'https'` |
| `req.get(name)` | `function` | Case-insensitive header lookup |

**Reading headers:**

Always use `req.get()` for header access — it is case-insensitive and works identically in local and Lambda environments:

```js
const apiKey    = req.get('x-api-key');       // custom header
const authToken = req.get('authorization');    // Authorization: Bearer ...
const ct        = req.get('content-type');     // Content-Type
```

**Body parsing:**

| `Content-Type` | `req.body` value |
|----------------|-----------------|
| `application/json` | Parsed object — `{ name: 'Alice' }` |
| `application/x-www-form-urlencoded` | Parsed object — `{ name: 'Alice' }` |
| anything else | Raw string |
| empty body | `null` |

### Response object (`res`)

| Helper | Description |
|--------|-------------|
| `res.json(data)` | Send JSON (`Content-Type: application/json`) |
| `res.send(data)` | Send string, or auto-detect JSON for objects |
| `res.status(code)` | Set status code — chainable |
| `res.set(header, value)` | Set a response header — chainable |
| `res.get(header)` | Read a response header |
| `res.type(contentType)` | Set `Content-Type` — chainable |

```js
// Chaining
res.status(201).set('Location', '/users/42').json(user);
res.status(422).json({ error: 'Validation failed', fields: ['email'] });

// Plain text
res.status(200).type('text/plain').send('OK');
```

---

## Deploying to AWS Lambda

Each app scaffolded by `forge create` already includes a `handler.js` ready for Lambda. The `forge deploy` command zips each app and creates or updates its Lambda function automatically.

### Quick deploy

```bash
# Uses ~/.aws/credentials (default AWS profile)
forge deploy

# Explicit credentials
forge deploy --access-key AKIA... --secret-key wJal... --region ap-south-1

# Bring your own IAM execution role
forge deploy --role arn:aws:iam::123456789012:role/my-role
```

```
  Deploying to AWS Lambda  region: ap-south-1

  Resolving IAM execution role... done

  users                    created
    https://abc123.lambda-url.ap-south-1.on.aws/
  orders                   updated
    https://def456.lambda-url.ap-south-1.on.aws/

  Done
```

### How it works

| Step | What happens |
|------|-------------|
| IAM role | Finds or creates `lambda-forge-execution-role` with `AWSLambdaBasicExecutionRole` (skip with `--role`) |
| Zip | Bundles `apps/<name>/`, `commons/`, framework runtime, and `node_modules/` |
| Create | Calls `CreateFunction` if the function does not exist, then waits until active |
| Update | Calls `UpdateFunctionCode` then waits until ready before applying config changes |
| Function URL | Creates a public HTTPS URL for the function (AuthType: NONE) |

### Credential resolution order

1. `--access-key` / `--secret-key` CLI flags
2. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` environment variables
3. `~/.aws/credentials` — default AWS profile

### Function naming

Functions are named `<project-name>-<app-name>`, matching the `name` field in your `package.json`.

```
my-api/apps/users    →   Lambda: my-api-users
my-api/apps/orders   →   Lambda: my-api-orders
```

### Permissions needed to deploy

The AWS credentials used must have the following permissions:

<details>
<summary>Minimum IAM policy</summary>

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaDeployment",
      "Effect": "Allow",
      "Action": [
        "lambda:GetFunction",
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunctionUrlConfig",
        "lambda:CreateFunctionUrlConfig",
        "lambda:AddPermission",
        "lambda:InvokeFunction"
      ],
      "Resource": "arn:aws:lambda:*:*:function:*"
    },
    {
      "Sid": "IAMRoleManagement",
      "Effect": "Allow",
      "Action": [
        "iam:GetRole",
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::*:role/lambda-forge-*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:FilterLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/*"
    }
  ]
}
```

| Permission | Why it's needed |
|---|---|
| `lambda:GetFunction` | Check whether a function exists and poll update status |
| `lambda:CreateFunction` | Create a new Lambda function on first deploy |
| `lambda:UpdateFunctionCode` | Upload a new zip to an existing function |
| `lambda:UpdateFunctionConfiguration` | Correct the handler reference on existing functions |
| `lambda:GetFunctionUrlConfig` | Check whether a Function URL already exists |
| `lambda:CreateFunctionUrlConfig` | Create a public HTTPS Function URL after deploy |
| `lambda:AddPermission` | Grant public `InvokeFunctionUrl` access to the Function URL |
| `lambda:InvokeFunction` | Invoke a deployed function via `forge invoke` |
| `iam:GetRole` | Look up the `lambda-forge-execution-role` before trying to create it |
| `iam:CreateRole` | Create the execution role when it doesn't exist |
| `iam:AttachRolePolicy` | Attach `AWSLambdaBasicExecutionRole` to the created role |
| `iam:PassRole` | Required by AWS when `CreateFunction` assigns a role to a function |
| `logs:FilterLogEvents` | Read CloudWatch log events via `forge logs` |

> If you supply your own role via `--role <arn>`, the three `iam:*` actions are not needed.  
> Scope the `IAMRoleManagement` statement to that specific ARN to follow least-privilege.

</details>

---

## Debugging

### View CloudWatch logs

```bash
# Last 60 minutes of logs
forge logs users

# Follow in real time
forge logs users --tail

# Last 10 minutes, errors only
forge logs users --since 10 --filter ERROR
```

```
  my-api-users  (following)

  2026-04-26T11:02:01.000Z  START RequestId: abc-123 Version: $LATEST
  2026-04-26T11:02:01.005Z  2026-04-26T11:02:01.005Z GET /
  2026-04-26T11:02:01.008Z  END RequestId: abc-123
  2026-04-26T11:02:01.009Z  REPORT RequestId: abc-123 Duration: 3.21 ms Billed Duration: 4 ms ...

  Watching for new logs... (Ctrl+C to stop)
```

### Invoke a deployed function

```bash
# Default GET / event (API Gateway v2 format)
forge invoke users

# Custom event payload
forge invoke users --data '{"version":"2.0","rawPath":"/users/42","requestContext":{"http":{"method":"GET"}},"body":null}'
```

```
  Invoking my-api-users

  Status   200

  Response
    {
      "statusCode": 200,
      "headers": { "content-type": "application/json" },
      "body": { "message": "Hello from lambda-forge!" },
      "isBase64Encoded": false
    }

  Execution logs
    START RequestId: abc-123 Version: $LATEST
    2026-04-26T11:02:01.005Z GET /users/42
    END RequestId: abc-123
    REPORT RequestId: abc-123 Duration: 3.21 ms Billed Duration: 4 ms Memory Size: 256 MB Max Memory Used: 64 MB
```

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
