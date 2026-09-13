const fs = require('fs');
const file = 'src/main.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetImport = "import { APP_VERSION } from './lib/constants.ts';";
const replacementImport = "import { APP_VERSION } from './lib/constants.ts';\nimport { showAlert } from './lib/alerts.ts';";
content = content.replace(targetImport, replacementImport);

const targetInit = "patchConsole('error');\npatchConsole('warn');";
const replacementInit = "patchConsole('error');\npatchConsole('warn');\n\n// Override window.alert to use our custom modal\nwindow.alert = function(message) {\n  showAlert(message ? message.toString() : '');\n};";
content = content.replace(targetInit, replacementInit);

fs.writeFileSync(file, content);
