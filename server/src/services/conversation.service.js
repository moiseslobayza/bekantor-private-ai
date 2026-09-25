const conversations = new Map();

const MAX_MESSAGES = 20;

export function getConversation(sessionId) {
  if (!conversations.has(sessionId)) {
    if (conversations.size >= 500) conversations.delete(conversations.keys().next().value);
    conversations.set(sessionId, []);
  }

  return conversations.get(sessionId);
}

export function addMessage(sessionId, role, content) {
  const conversation = getConversation(sessionId);

  conversation.push({
    role,
    content,
  });

  if (conversation.length > MAX_MESSAGES) {
    conversation.splice(
      0,
      conversation.length - MAX_MESSAGES
    );
  }
}
