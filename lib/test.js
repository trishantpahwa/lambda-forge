const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = function test() {
    const testDir = path.resolve(process.cwd(), 'test');

    if (!fs.existsSync(testDir)) {
        console.error('  Error: No "test" directory found.');
        console.error('  Make sure you are in a lambda-press project directory.\n');
        process.exit(1);
    }

    const mocha = spawn('npx', ['mocha'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: true,
    });

    mocha.on('exit', code => process.exit(code ?? 0));
};
