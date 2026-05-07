import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const workspace = path.resolve(__dirname, '../../src/test/data');
        const openedFile = path.resolve(__dirname, '../../src/test/data/testcase.txt');
        await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [workspace, openedFile] });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
