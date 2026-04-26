const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const {
    LambdaClient,
    GetFunctionCommand,
    CreateFunctionCommand,
    UpdateFunctionCodeCommand,
    UpdateFunctionConfigurationCommand,
    CreateFunctionUrlConfigCommand,
    GetFunctionUrlConfigCommand,
    AddPermissionCommand,
} = require('@aws-sdk/client-lambda');
const { IAMClient, GetRoleCommand, CreateRoleCommand, AttachRolePolicyCommand } = require('@aws-sdk/client-iam');

const ROLE_NAME = 'lambda-press-execution-role';
const LAMBDA_RUNTIME = 'nodejs20.x';
const LAMBDA_HANDLER = 'handler.handler';   // always root-level handler.js
const LAMBDA_TIMEOUT = 30;
const LAMBDA_MEMORY = 256;

module.exports = async function deploy(args) {
    const region = getArg(args, '--region') || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const accessKeyId = getArg(args, '--access-key') || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = getArg(args, '--secret-key') || process.env.AWS_SECRET_ACCESS_KEY;
    const roleArg = getArg(args, '--role');

    const credentials = accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined; // Falls through to ~/.aws/credentials / instance profile

    const clientConfig = { region, ...(credentials && { credentials }) };
    const lambda = new LambdaClient(clientConfig);
    const iam = new IAMClient({ ...clientConfig, region: 'us-east-1' }); // IAM is global

    const cwd = (() => { try { return process.cwd(); } catch { return null; } })();
    if (!cwd) {
        console.error('  Error: Cannot determine current directory.\n');
        process.exit(1);
    }

    const appsDir = path.join(cwd, 'apps');
    if (!fs.existsSync(appsDir)) {
        console.error('  Error: No "apps" directory found. Run from a lambda-press project.\n');
        process.exit(1);
    }

    const projectName = readProjectName(cwd);

    const appDirs = fs.readdirSync(appsDir).filter(name =>
        fs.statSync(path.join(appsDir, name)).isDirectory()
    );

    if (appDirs.length === 0) {
        console.warn('  Warning: No apps found in the "apps" directory.\n');
        return;
    }

    console.log(`\n  Deploying to AWS Lambda  region: ${region}\n`);

    let roleArn = roleArg;
    if (!roleArn) {
        process.stdout.write('  Resolving IAM execution role...');
        try {
            roleArn = await ensureRole(iam);
            console.log(' done\n');
        } catch (err) {
            console.log('');
            console.error(`  Error resolving IAM role: ${err.message}\n`);
            console.error('  Tip: pass an existing role with --role <arn> to skip auto-creation.\n');
            process.exit(1);
        }
    }

    for (const appName of appDirs) {
        const functionName = `${projectName}-${appName}`;

        process.stdout.write(`  ${appName.padEnd(24)} `);

        if (!fs.existsSync(path.join(appsDir, appName, 'handler.js'))) {
            console.log('skipped (no handler.js)');
            continue;
        }

        try {
            const zipBuffer = await buildZip(cwd, appName);
            const exists = await functionExists(lambda, functionName);

            if (exists) {
                await lambda.send(new UpdateFunctionCodeCommand({
                    FunctionName: functionName,
                    ZipFile: zipBuffer,
                }));
                await waitUntilReady(lambda, functionName);
                // Ensure handler is always up-to-date (fixes functions deployed before this fix)
                await lambda.send(new UpdateFunctionConfigurationCommand({
                    FunctionName: functionName,
                    Handler: LAMBDA_HANDLER,
                }));
                await waitUntilReady(lambda, functionName);
                console.log('updated');
            } else {
                await withRetry(() => lambda.send(new CreateFunctionCommand({
                    FunctionName: functionName,
                    Runtime: LAMBDA_RUNTIME,
                    Role: roleArn,
                    Handler: LAMBDA_HANDLER,
                    Code: { ZipFile: zipBuffer },
                    Timeout: LAMBDA_TIMEOUT,
                    MemorySize: LAMBDA_MEMORY,
                })));
                await waitUntilReady(lambda, functionName);
                console.log('created');
            }

            const url = await ensureFunctionUrl(lambda, functionName);
            console.log(`    ${url}`);
        } catch (err) {
            console.log(`failed — ${err.message}`);
        }
    }

    console.log('\n  Done\n');
};

// ── IAM ───────────────────────────────────────────────────────────────────────

async function ensureRole(iam) {
    try {
        const { Role } = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
        return Role.Arn;
    } catch (err) {
        if (err.name !== 'NoSuchEntityException') throw err;
    }

    const { Role } = await iam.send(new CreateRoleCommand({
        RoleName: ROLE_NAME,
        Description: 'Lambda execution role managed by lambda-press',
        AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole',
            }],
        }),
    }));

    await iam.send(new AttachRolePolicyCommand({
        RoleName: ROLE_NAME,
        PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    }));

    // New roles take a few seconds to propagate across AWS
    await sleep(10000);
    return Role.Arn;
}

// ── Lambda ────────────────────────────────────────────────────────────────────

async function functionExists(lambda, functionName) {
    try {
        await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
        return true;
    } catch (err) {
        if (err.name === 'ResourceNotFoundException') return false;
        throw err;
    }
}

async function ensureFunctionUrl(lambda, functionName) {
    let functionUrl;

    try {
        const { FunctionUrl } = await lambda.send(
            new GetFunctionUrlConfigCommand({ FunctionName: functionName })
        );
        functionUrl = FunctionUrl;
    } catch (err) {
        if (err.name !== 'ResourceNotFoundException') throw err;

        const { FunctionUrl } = await lambda.send(new CreateFunctionUrlConfigCommand({
            FunctionName: functionName,
            AuthType: 'NONE',
            Cors: {
                AllowOrigins: ['*'],
                AllowMethods: ['*'],
                AllowHeaders: ['*'],
            },
        }));
        functionUrl = FunctionUrl;
    }

    // Always ensure the public invoke permission exists — it may be missing on
    // functions that were updated rather than freshly created.
    try {
        await lambda.send(new AddPermissionCommand({
            FunctionName: functionName,
            StatementId: 'public-url-access',
            Action: 'lambda:InvokeFunctionUrl',
            Principal: '*',
            FunctionUrlAuthType: 'NONE',
        }));
    } catch (err) {
        if (err.name !== 'ResourceConflictException') throw err;
        // Permission already exists — fine
    }

    return functionUrl;
}

// Poll GetFunction (uses lambda:GetFunction, already required) until the function
// is Active and its last update has completed. Avoids needing lambda:GetFunctionConfiguration.
async function waitUntilReady(lambda, functionName, maxWaitMs = 120000) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
        const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
        const state = Configuration.State;
        const updateStatus = Configuration.LastUpdateStatus;

        if (state === 'Failed' || updateStatus === 'Failed') {
            throw new Error(`Function entered a failed state during update`);
        }
        if (state === 'Active' && updateStatus !== 'InProgress') {
            return;
        }
        await sleep(3000);
    }
    throw new Error(`Timed out waiting for function ${functionName} to become ready`);
}

// Retry on IAM role propagation lag (InvalidParameterValueException with "role" in message)
async function withRetry(fn, retries = 4, delay = 5000) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isRoleLag = err.name === 'InvalidParameterValueException'
                && err.message.toLowerCase().includes('role');
            if (isRoleLag && attempt < retries) {
                await sleep(delay);
            } else {
                throw err;
            }
        }
    }
}

// ── Zip ───────────────────────────────────────────────────────────────────────

// Zip layout:
//   handler.js           ← generated proxy at root (Lambda entry: handler.handler)
//   apps/<appName>/      ← real app files; relative require('../../commons') resolves correctly
//   commons/             ← shared utilities
//   node_modules/        ← dependencies
//
// The proxy delegates to the real handler while keeping all relative paths intact.

function buildZip(projectDir, appName) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const archive = archiver('zip', { zlib: { level: 6 } });

        archive.on('data', chunk => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);

        // Root-level proxy — this is what Lambda actually calls
        archive.append(
            `module.exports = require('./apps/${appName}/handler');\n`,
            { name: 'handler.js' }
        );

        // Real app files preserved at their original path so all relative
        // require() calls (e.g. '../../commons') resolve identically to local dev
        archive.directory(path.join(projectDir, 'apps', appName), `apps/${appName}`);

        const commonsDir = path.join(projectDir, 'commons');
        if (fs.existsSync(commonsDir)) {
            archive.directory(commonsDir, 'commons');
        }

        // Always bundle the running lambda-press source directly so the Lambda
        // runtime uses the exact same version as the CLI, not whatever npm installed.
        const pressRoot = path.join(__dirname, '..');
        archive.file(path.join(pressRoot, 'package.json'), { name: 'node_modules/lambda-press/package.json' });
        archive.directory(path.join(pressRoot, 'lib'), 'node_modules/lambda-press/lib');

        // Add every node_modules entry from the project except lambda-press,
        // which is already bundled from source above.
        const nodeModulesDir = path.join(projectDir, 'node_modules');
        if (fs.existsSync(nodeModulesDir)) {
            for (const entry of fs.readdirSync(nodeModulesDir)) {
                if (entry === 'lambda-press') continue;
                const entryPath = path.join(nodeModulesDir, entry);
                if (fs.statSync(entryPath).isDirectory()) {
                    archive.directory(entryPath, `node_modules/${entry}`);
                } else {
                    archive.file(entryPath, { name: `node_modules/${entry}` });
                }
            }
        }

        archive.finalize();
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readProjectName(projectDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')).name
            || 'lambda-press-app';
    } catch {
        return 'lambda-press-app';
    }
}

function getArg(args, flag) {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
