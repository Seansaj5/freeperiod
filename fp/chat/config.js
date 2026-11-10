// Supabase projects for chat. url = project URL, key = the publishable (anon) key: both are public by design.
// Both stay EMPTY until the Supabase projects exist (then Sean's setup step fills them in). Empty means chat is "off":
// no client, no network, no errors. The secret/service key never goes here.
export const CHAT_PROJECTS = {
  test: { url: '', key: '' }, // free-period-chat-test (localhost / 127.0.0.1)
  live: { url: '', key: '' }, // free-period-chat
};

function isLocal() {
  try {
    const h = (globalThis.location && globalThis.location.hostname) || '';
    return h === 'localhost' || h === '127.0.0.1';
  } catch { return false; }
}

export const CHAT = isLocal() ? CHAT_PROJECTS.test : CHAT_PROJECTS.live;
