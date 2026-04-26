#!/usr/bin/env node

const [, , command, ...args] = process.argv;

if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
}

const commands = {
    create: () => require("../lib/create")(args),
    serve:  () => require("../lib/watcher")(args),
    test:   () => require("../lib/test")(args),
    deploy: () => require("../lib/deploy")(args),
    logs:   () => require("../lib/logs")(args),
    invoke: () => require("../lib/invoke")(args),
};

if (commands[command]) {
    commands[command]();
} else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function printHelp() {
    console.log("\n  lambda-forge\n");
    console.log("  Usage: forge <command> [options]\n");

    console.log("  Commands:");
    console.log("    create                   Create a new lambda-forge project");
    console.log("    serve                    Start local development server");
    console.log("    test                     Run project tests with Mocha");
    console.log("    deploy                   Deploy apps to AWS Lambda");
    console.log("    logs   <app>             Stream CloudWatch logs for a deployed app");
    console.log("    invoke <app>             Invoke a deployed app and print the response\n");

    console.log("  Options for serve:");
    console.log("    --port <port>            Base port (default: 3000)\n");

    console.log("  Options for deploy / logs / invoke:");
    console.log("    --access-key <key>       AWS access key ID");
    console.log("    --secret-key <secret>    AWS secret access key");
    console.log("    --region <region>        AWS region (default: us-east-1)\n");

    console.log("  Additional options for deploy:");
    console.log("    --role <arn>             IAM execution role ARN (auto-created if omitted)\n");

    console.log("  Additional options for logs:");
    console.log("    --tail, -f               Follow — poll for new entries every 2 s");
    console.log("    --since <minutes>        How far back to look (default: 60)");
    console.log("    --filter <pattern>       Only show lines matching this pattern\n");

    console.log("  Additional options for invoke:");
    console.log("    --data <json>            Event payload (default: GET / API Gateway v2 event)\n");

    console.log("  AWS credentials are resolved in this order:");
    console.log("    1. --access-key / --secret-key flags");
    console.log("    2. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars");
    console.log("    3. ~/.aws/credentials (default AWS profile)\n");
}
