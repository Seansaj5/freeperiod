// Supabase projects for chat. url = project URL, key = the publishable (anon) key: both are public by design.
// Empty would mean chat is "off": no client, no network, no errors. The secret/service key never goes here.
export const CHAT_PROJECTS = {
  test: { url: 'https://buigcdsxebwjlckfrbbb.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1aWdjZHN4ZWJ3amxja2ZyYmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMTI1MjEsImV4cCI6MjEwOTg4ODUyMX0.76yQ0p1M5DZpQMjkLy1Hm4k7UKsOu3EJqAIaw9iMc60' }, // free-period-chat-test (localhost / 127.0.0.1)
  live: { url: 'https://sazaigcsheegwgpogegq.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhemFpZ2NzaGVlZ3dncG9nZWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMTE5MTYsImV4cCI6MjEwOTg4NzkxNn0.G-zx6jRIDEfXGbI0xJtqI_AsAm5XdgYSX_SaN8g2QHA' }, // free-period-chat
};

function isLocal() {
  try {
    const h = (globalThis.location && globalThis.location.hostname) || '';
    return h === 'localhost' || h === '127.0.0.1';
  } catch { return false; }
}

export const CHAT = isLocal() ? CHAT_PROJECTS.test : CHAT_PROJECTS.live;
