#!/usr/bin/env node

const [, , command, ...args] = process.argv;

if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
}

const commands = {
    create: () => require("../lib/create")(args),
    serve: () => require("../lib/server")(args),
    test: () => require("../lib/test")(args),
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
    console.log("    create         Create a new lambda-forge project");
    console.log("    serve          Start local development server");
    console.log("    test           Run project tests with Mocha");
    console.log("\n  Options for serve:");
    console.log("    --port <port>  Base port (default: 3000, each app gets the next port)\n");
}
