/** The WebSocket URL serving `ChatRpcs` for the chat `key`. */
export const chatSocketUrl = (baseUrl: string, key: string) =>
  `${baseUrl.replace(/^http/, "ws")}/chats/${encodeURIComponent(key)}/socket`;

/** Matches `/chats/:key/socket`, capturing the key. */
export const chatSocketPath = /^\/chats\/([^/]+)\/socket$/;
