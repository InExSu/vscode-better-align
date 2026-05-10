import * as vscode from 'vscode'

import {
    parseLineIgnoringStrings,
    findLineBlocks,
    alignBlock,
    DEFAULT_LANGUAGE_RULES,
} from '../../src/extension'

export function activate(context: vscode.ExtensionContext): void {
    const Mocha = require('mocha')
    const mocha = new Mocha()

    const testGlob = new (require('glob'))('**/test/**/*.test.js', { cwd: context.extensionPath })
    require('mocha/lib/mocha').prototype.suite = () => {}

    mocha.addFile(new (require('glob'))('**/test/**/*.test.js', { cwd: context.extensionPath }))
    mocha.run(failures => {
        context.subscriptions.push({
            dispose: () => {
                if (failures > 0) {
                    throw new Error(`${failures} tests failed.`)
                }
            },
        })
    })
}