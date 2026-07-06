const fs = require('fs');
const file = '/Users/armaganbengi/Instomer/instomerchat/frontend/src/pages/Customers/Customers.jsx';
let content = fs.readFileSync(file, 'utf8');

// Fix selectedContact.id to selectedContactRef.current?.id to avoid closure issues
content = content.replace(/c\.id !== selectedContact\.id/g, 'c.id !== (selectedContactRef.current?.id || selectedContact?.id)');

// In onAssignUser, also update teamId if it was passed!
// Wait, onAssignUser only receives (convId, userId, skipApi). It doesn't receive teamId!
// So local update CANNOT update teamId.
// BUT silentReloadContacts WILL get the fresh data from the server.
