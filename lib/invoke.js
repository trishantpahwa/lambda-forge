const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');
const path = require('path');

module.exports = async function invoke(args) {
    const appName = args.find(a => !a.startsWith('-'));

    if (!appName) {
        console.error('\n  Usage: press invoke <app-name> [options]');
        console.error('\n  Options:');
        console.error('    --data <json>      Event payload (default: minimal GET / API Gateway v2 event)');
        console.error('    --region <region>  AWS region');
        console.error('    --access-key <k>   AWS access key ID');
        console.error('    --secret-key <s>   AWS secret access key\n');
        process.exit(1);
    }

    const dataArg     = getArg(args, '--data');
    const region      = getArg(args, '--region')     || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const accessKeyId = getArg(args, '--access-key') || process.env.AWS_ACCESS_KEY_ID;
    const secretKey   = getArg(args, '--secret-key') || process.env.AWS_SECRET_ACCESS_KEY;

    const credentials = accessKeyId && secretKey
        ? { accessKeyId, secretAccessKey: secretKey }
        : undefined;

    let event;
    if (dataArg) {
        try {
            event = JSON.parse(dataArg);
        } catch {
            console.error('  Error: --data must be valid JSON.\n');
            process.exit(1);
        }
    } else {
        event = defaultEvent();
    }

    const cwd = (() => { try { return process.cwd(); } catch { return null; } })();
    const projectName  = readProjectName(cwd);
    const functionName = `${projectName}-${appName}`;

    const client = new LambdaClient({ region, ...(credentials && { credentials }) });

    console.log(`\n  Invoking ${functionName}\n`);

    let resp;
    try {
        resp = await client.send(new InvokeCommand({
            FunctionName: functionName,
            Payload:      Buffer.from(JSON.stringify(event)),
            LogType:      'Tail',   // returns last 4 KB of execution logs
        }));
    } catch (err) {
        console.error(`  Error: ${err.message}\n`);
        process.exit(1);
    }

    // ── Status ──────────────────────────────────────────────────────────────
    const statusLabel = resp.FunctionError
        ? `${resp.StatusCode} (${resp.FunctionError})`
        : String(resp.StatusCode);
    console.log(`  Status   ${statusLabel}`);

    // ── Response body ────────────────────────────────────────────────────────
    if (resp.Payload) {
        const raw = Buffer.from(resp.Payload).toString();
        let parsed;
        try {
            parsed = JSON.parse(raw);
            // Unwrap API Gateway response body if present
            if (parsed.body) {
                try { parsed.body = JSON.parse(parsed.body); } catch {}
            }
            console.log('\n  Response');
            console.log(indent(JSON.stringify(parsed, null, 2)));
        } catch {
            console.log('\n  Response');
            console.log(indent(raw));
        }
    }

    // ── Execution logs ───────────────────────────────────────────────────────
    if (resp.LogResult) {
        const logLines = Buffer.from(resp.LogResult, 'base64').toString().trimEnd().split('\n');
        console.log('\n  Execution logs');
        for (const line of logLines) {
            console.log(`    ${line}`);
        }
    }

    console.log('');
};

function defaultEvent() {
    return {
        version: '2.0',
        routeKey: 'GET /',
        rawPath: '/',
        rawQueryString: '',
        headers: {
            'content-type': 'application/json',
            host: 'localhost',
        },
        requestContext: {
            http: { method: 'GET', path: '/' },
        },
        body: null,
        isBase64Encoded: false,
    };
}

function indent(str) {
    return str.split('\n').map(l => `    ${l}`).join('\n');
}

function readProjectName(projectDir) {
    if (!projectDir) return 'lambda-press-app';
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
