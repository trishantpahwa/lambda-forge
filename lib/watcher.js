const chokidar = require('chokidar');
const { spawn } = require('child_process');
const path = require('path');

module.exports = function watch(args = []) {
    const projectDir = process.cwd();
    let child = null;
    let debounce = null;

    function startServer() {
        child = spawn(process.execPath, [path.join(__dirname, '_server-worker.js')], {
            stdio: 'inherit',
            cwd: projectDir,
            env: { ...process.env, PRESS_ARGS: JSON.stringify(args) },
        });

        child.on('exit', (code, signal) => {
            if (signal !== 'SIGTERM') process.exit(code ?? 1);
        });
    }

    function restart(filePath) {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const rel = path.relative(projectDir, filePath);
            console.log(`\n  [watch] ${rel} changed — restarting...\n`);
            child.kill('SIGTERM');
            child.once('exit', startServer);
        }, 150);
    }

    startServer();

    chokidar
        .watch(['apps', 'commons'], {
            cwd: projectDir,
            ignoreInitial: true,
            ignored: /node_modules/,
        })
        .on('change', restart)
        .on('add', restart)
        .on('unlink', restart);

    process.on('SIGINT', () => {
        if (child) child.kill('SIGTERM');
        process.exit(0);
    });
};
