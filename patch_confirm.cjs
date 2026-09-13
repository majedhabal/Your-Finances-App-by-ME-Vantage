const fs = require('fs');
const file = 'src/components/AIConversationsHistoryView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetImport = "import { Trash2, MessageSquare, Clock, ArrowLeft, Search, Plus, Calendar } from 'lucide-react';";
const replacementImport = "import { Trash2, MessageSquare, Clock, ArrowLeft, Search, Plus, Calendar } from 'lucide-react';\nimport { showConfirm } from '../lib/alerts';";
content = content.replace(targetImport, replacementImport);

const targetLogic = `  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering open
    if (!confirm(t('ai_history.confirm_delete'))) return;`;
const replacementLogic = `  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering open
    if (!(await showConfirm(t('ai_history.confirm_delete')))) return;`;
content = content.replace(targetLogic, replacementLogic);

fs.writeFileSync(file, content);
