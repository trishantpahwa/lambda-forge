const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const fs = require('fs');
const path = require('path');

module.exports = async function logs(args) {
    const appName = args.find(a => !a.startsWith('-'));

    if (!appName) {
        console.error('\n  Usage: press logs <app-name> [options]');
        console.error('\n  Options:');
        console.error('    --tail, -f         Follow — poll for new log entries');
        console.error('    --since <minutes>  How far back to look (default: 60)');
        console.error('    --filter <text>    Only show lines matching this pattern');
        console.error('    --region <region>  AWS region');
        console.error('    --access-key <k>   AWS access key ID');
        console.error('    --secret-key <s>   AWS secret access key\n');
        process.exit(1);
    }

    const tail        = args.includes('--tail') || args.includes('-f');
    const since       = parseInt(getArg(args, '--since') || '60', 10);
    const filter      = getArg(args, '--filter') || undefined;
    const region      = getArg(args, '--region')     || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const accessKeyId = getArg(args, '--access-key') || process.env.AWS_ACCESS_KEY_ID;
    const secretKey   = getArg(args, '--secret-key') || process.env.AWS_SECRET_ACCESS_KEY;

    const credentials = accessKeyId && secretKey
        ? { accessKeyId, secretAccessKey: secretKey }
        : undefined;

    const cwd = (() => { try { return process.cwd(); } catch { return null; } })();
    const projectName = readProjectName(cwd);
    const functionName = `${projectName}-${appName}`;
    const logGroup    = `/aws/lambda/${functionName}`;

    const client = new CloudWatchLogsClient({ region, ...(credentials && { credentials }) });

    console.log(`\n  ${functionName}  ${tail ? '(following)' : `(last ${since} min)`}\n`);

    let startTime = Date.now() - since * 60 * 1000;

    async function poll() {
        try {
            const resp = await client.send(new FilterLogEventsCommand({
                logGroupName:  logGroup,
                startTime,
                filterPattern: filter,
                limit:         100,
            }));

            for (const event of (resp.events || [])) {
                printEvent(event);
                startTime = Math.max(startTime, event.timestamp + 1);
            }
        } catch (err) {
            if (err.name === 'ResourceNotFoundException') {
                console.error(`  Log group not found: ${logGroup}`);
                console.error('  The function may not have been invoked yet.\n');
                if (!tail) process.exit(1);
            } else {
                console.error(`  Error: ${err.message}\n`);
                if (!tail) process.exit(1);
            }
        }
    }

    await poll();

    if (!tail) return;

    console.log('  Watching for new logs... (Ctrl+C to stop)\n');
    const interval = setInterval(poll, 2000);

    process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('\n  Stopped.\n');
        process.exit(0);
    });
};

function printEvent(event) {
    const time = new Date(event.timestamp).toISOString();
    const msg  = event.message.trimEnd();
    console.log(`  ${time}  ${msg}`);
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
