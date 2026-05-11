const vscode = {
    workspace: {
        getConfiguration: () => ({
            get: () => []
        })
    },
    window: {
        activeTextEditor: false,
        showErrorMessage: () => { },
        showInformationMessage: () => { }
    },
    commands: {
        registerCommand: () => { },
        executeCommand: () => { }
    },
    ExtensionContext: class { },
    TextEditor: class { },
    TextDocument: class { }
}

module.exports = vscode
module.exports.default = vscode