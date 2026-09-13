const fs = require('fs');
const file = 'src/components/NotificationDispatchHub.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "const sendDeviceNotification = (title: string, body: string, onClick?: () => void) => {",
  "const sendDeviceNotification = (title: string, body: string, onClick?: () => void) => {\n    if (!title || title.trim() === '') title = 'Your Finances';"
);

fs.writeFileSync(file, content);
