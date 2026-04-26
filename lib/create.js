const readline = require('readline');
const fs = require('fs');
const path = require('path');
const templates = require('./templates');

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

module.exports = async function create() {
    // Capture cwd before any async operations — process.cwd() can throw EPERM
    // if the working directory is deleted or becomes inaccessible during readline await.
    let cwd;
    try {
        cwd = process.cwd();
    } catch {
        console.error('  Error: Cannot determine current directory. Run forge from a valid directory.');
        process.exit(1);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    console.log('\n  Welcome to lambda-forge!\n');

    let projectName;
    while (!projectName) {
        const input = (await question('  Project name: ')).trim();
        if (!input) {
            console.log('  Project name cannot be empty.');
        } else if (!NAME_PATTERN.test(input)) {
            console.log('  Project name can only contain letters, numbers, hyphens, and underscores.');
        } else {
            projectName = input;
        }
    }

    let appName;
    while (!appName) {
        const input = (await question('  First app name: ')).trim();
        if (!input) {
            console.log('  App name cannot be empty.');
        } else if (!NAME_PATTERN.test(input)) {
            console.log('  App name can only contain letters, numbers, hyphens, and underscores.');
        } else {
            appName = input;
        }
    }

    rl.close();
    console.log('');

    const projectDir = path.resolve(cwd, projectName);

    if (fs.existsSync(projectDir)) {
        console.error(`  Error: Directory "${projectName}" already exists.`);
        process.exit(1);
    }

    [
        path.join(projectDir, 'apps', appName),
        path.join(projectDir, 'commons'),
        path.join(projectDir, 'test'),
    ].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

    const files = {
        [`apps/${appName}/routes.js`]: templates.routes(appName),
        [`apps/${appName}/handler.js`]: templates.handler(appName),
        [`apps/${appName}/middleware.js`]: templates.middleware(),
        [`apps/${appName}/controllers.js`]: templates.controllers(),
        [`apps/${appName}/models.js`]: templates.models(),
        'commons/utils.js': templates.utils(),
        'commons/constants.js': templates.constants(),
        'test/index.js': templates.test(projectName),
        'package.json': templates.packageJson(projectName),
    };

    for (const [filePath, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(projectDir, filePath), content);
    }

    console.log(`  Created project "${projectName}"\n`);
    console.log('  Next steps:');
    console.log(`    cd ${projectName}`);
    console.log('    npm install');
    console.log('    npm start\n');
};
