/**
 * Human-friendly push notification messages for tool confirmation requests.
 *
 * Each OpenClaw tool gets a tailored title + body so that the iOS notification
 * is immediately understandable without opening the app.
 */

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function firstLine(text: string, max = 80): string {
  const line = text.split('\n')[0].trim();
  return truncate(line, max);
}

interface NotificationText {
  title: string;
  body: string;
}

type MessageFormatter = (
  agent: string,
  args: Record<string, unknown>,
) => NotificationText;

const toolMessages: Record<string, MessageFormatter> = {
  exec: (agent, args) => {
    const cmd = str(args.command) || str(args.cmd) || 'a command';
    return {
      title: `${agent} wants to run a command`,
      body: firstLine(cmd, 120),
    };
  },

  read: (agent, args) => {
    const path = str(args.file_path) || str(args.path) || str(args.file) || 'a file';
    return {
      title: `${agent} wants to read a file`,
      body: truncate(path, 120),
    };
  },

  write: (agent, args) => {
    const path = str(args.file_path) || str(args.path) || str(args.file) || 'a file';
    return {
      title: `${agent} wants to write to a file`,
      body: truncate(path, 120),
    };
  },

  edit: (agent, args) => {
    const path = str(args.file_path) || str(args.path) || str(args.file) || 'a file';
    return {
      title: `${agent} wants to edit a file`,
      body: truncate(path, 120),
    };
  },

  browser: (agent, args) => {
    const url = str(args.url);
    const action = str(args.action) || str(args.command);
    if (url) {
      return {
        title: `${agent} wants to use the browser`,
        body: truncate(url, 120),
      };
    }
    return {
      title: `${agent} wants to use the browser`,
      body: action ? firstLine(action, 120) : 'Perform a browser action',
    };
  },

  message: (agent, args) => {
    const to = str(args.to) || str(args.recipient) || str(args.channel);
    const preview = str(args.content) || str(args.message) || str(args.text);
    const parts: string[] = [];
    if (to) parts.push(`To: ${to}`);
    if (preview) parts.push(firstLine(preview, 80));
    return {
      title: `${agent} wants to send a message`,
      body: parts.length > 0 ? truncate(parts.join(' — '), 120) : 'Send an external message',
    };
  },

  nodes: (agent, args) => {
    const action = str(args.action) || str(args.command);
    const node = str(args.node) || str(args.node_id) || str(args.name);
    const parts: string[] = [];
    if (action) parts.push(action);
    if (node) parts.push(node);
    return {
      title: `${agent} wants to control a device`,
      body: parts.length > 0 ? truncate(parts.join(': '), 120) : 'Manage a device node',
    };
  },

  cron: (agent, args) => {
    const action = str(args.action) || str(args.command);
    const schedule = str(args.schedule) || str(args.expression) || str(args.cron);
    const parts: string[] = [];
    if (action) parts.push(action);
    if (schedule) parts.push(schedule);
    return {
      title: `${agent} wants to manage a scheduled task`,
      body: parts.length > 0 ? truncate(parts.join(': '), 120) : 'Create or modify a cron job',
    };
  },

  gateway: (agent, args) => {
    const action = str(args.action) || str(args.command);
    return {
      title: `${agent} wants to change gateway settings`,
      body: action ? firstLine(action, 120) : 'Modify gateway configuration',
    };
  },

  canvas: (agent, args) => {
    const action = str(args.action) || str(args.command);
    return {
      title: `${agent} wants to update the canvas`,
      body: action ? firstLine(action, 120) : 'Modify canvas content',
    };
  },

  sessions_spawn: (agent, args) => {
    const name = str(args.agent) || str(args.name) || str(args.session_name);
    return {
      title: `${agent} wants to create a new session`,
      body: name ? `Agent: ${truncate(name, 100)}` : 'Spawn a new agent session',
    };
  },

  sessions_send: (agent, args) => {
    const sid = str(args.session_id) || str(args.session);
    const preview = str(args.message) || str(args.content) || str(args.text);
    const parts: string[] = [];
    if (sid) parts.push(`Session: ${sid}`);
    if (preview) parts.push(firstLine(preview, 60));
    return {
      title: `${agent} wants to message another session`,
      body: parts.length > 0 ? truncate(parts.join(' — '), 120) : 'Send a message to another session',
    };
  },

  web_fetch: (agent, args) => {
    const url = str(args.url) || 'a URL';
    return {
      title: `${agent} wants to fetch a web page`,
      body: truncate(url, 120),
    };
  },

  web_search: (agent, args) => {
    const query = str(args.query) || str(args.q) || str(args.search) || 'the web';
    return {
      title: `${agent} wants to search the web`,
      body: truncate(query, 120),
    };
  },

  image: (agent, args) => {
    const prompt = str(args.prompt) || str(args.description);
    const path = str(args.path) || str(args.file_path) || str(args.url);
    if (prompt) {
      return {
        title: `${agent} wants to generate an image`,
        body: firstLine(prompt, 120),
      };
    }
    return {
      title: `${agent} wants to process an image`,
      body: path ? truncate(path, 120) : 'Analyze or generate an image',
    };
  },

  tts: (agent, args) => {
    const text = str(args.text) || str(args.content) || str(args.input);
    return {
      title: `${agent} wants to generate speech`,
      body: text ? firstLine(text, 120) : 'Convert text to speech',
    };
  },

  memory_get: (agent, args) => {
    const key = str(args.key) || str(args.id) || str(args.name);
    return {
      title: `${agent} wants to retrieve a memory`,
      body: key ? truncate(key, 120) : 'Read from memory store',
    };
  },

  memory_search: (agent, args) => {
    const query = str(args.query) || str(args.q) || str(args.search);
    return {
      title: `${agent} wants to search memories`,
      body: query ? truncate(query, 120) : 'Search the memory store',
    };
  },

  session_status: (agent, args) => {
    const sid = str(args.session_id) || str(args.session);
    return {
      title: `${agent} wants to check session status`,
      body: sid ? `Session: ${truncate(sid, 100)}` : 'Check a session\'s current status',
    };
  },

  sessions_list: (agent) => ({
    title: `${agent} wants to list sessions`,
    body: 'View all active sessions',
  }),

  sessions_history: (agent, args) => {
    const sid = str(args.session_id) || str(args.session);
    return {
      title: `${agent} wants to view session history`,
      body: sid ? `Session: ${truncate(sid, 100)}` : 'Review session conversation history',
    };
  },

  agents_list: (agent) => ({
    title: `${agent} wants to list agents`,
    body: 'View all available agents',
  }),

  subagents: (agent, args) => {
    const action = str(args.action) || str(args.command);
    const name = str(args.name) || str(args.agent);
    const parts: string[] = [];
    if (action) parts.push(action);
    if (name) parts.push(name);
    return {
      title: `${agent} wants to manage sub-agents`,
      body: parts.length > 0 ? truncate(parts.join(': '), 120) : 'Create or manage sub-agents',
    };
  },
};

/**
 * Build human-friendly notification title + body for a tool confirmation.
 * Falls back to a generic message for unknown tool names.
 */
export function formatToolNotification(
  toolName: string,
  agentName: string,
  args: Record<string, unknown>,
): NotificationText {
  const agent = agentName || 'Your agent';
  const formatter = toolMessages[toolName];

  if (formatter) {
    return formatter(agent, args);
  }

  const argsSummary = truncate(JSON.stringify(args), 120);
  return {
    title: `${agent} wants to use ${toolName}`,
    body: argsSummary === '{}' ? `Invoke the ${toolName} tool` : argsSummary,
  };
}
