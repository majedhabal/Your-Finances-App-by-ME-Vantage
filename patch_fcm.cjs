const fs = require('fs');
const file = 'public/firebase-messaging-sw.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const notificationTitle = payload.notification.title;',
  "const notificationTitle = payload.notification.title || 'Your Finances';"
);

fs.writeFileSync(file, content);
