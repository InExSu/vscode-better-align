"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
function activate(context) {
    const Mocha = require('mocha');
    const mocha = new Mocha();
    const testGlob = new (require('glob'))('**/test/**/*.test.js', { cwd: context.extensionPath });
    require('mocha/lib/mocha').prototype.suite = () => { };
    mocha.addFile(new (require('glob'))('**/test/**/*.test.js', { cwd: context.extensionPath }));
    mocha.run(failures => {
        context.subscriptions.push({
            dispose: () => {
                if (failures > 0) {
                    throw new Error(`${failures} tests failed.`);
                }
            },
        });
    });
}
exports.activate = activate;
//# sourceMappingURL=index.js.map