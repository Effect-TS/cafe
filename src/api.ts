// Shared between the Worker (src/worker.ts) and the Foldkit app (web/).
// Keep this file free of runtime/Cloudflare imports so the browser can use it.
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";

/** A single chat message, broadcast to every socket subscribed to its key. */
export const ChatMessage = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  text: Schema.String,
  sentAt: Schema.Number,
});
export type ChatMessage = typeof ChatMessage.Type;

/** Frames sent over the events WebSocket, JSON-encoded. */
export const ChatEvent = Schema.Union([
  Schema.TaggedStruct("MessagePosted", { message: ChatMessage }),
]);
export type ChatEvent = typeof ChatEvent.Type;

export const ChatEventJson = Schema.fromJsonString(ChatEvent);

const KeyParams = Schema.Struct({ key: Schema.String });

/** POST a prompt to a chat; it is broadcast to every subscriber of `key`. */
const sendPrompt = HttpApiEndpoint.post("sendPrompt", "/chats/:key/prompts", {
  params: KeyParams,
  payload: Schema.Struct({ text: Schema.NonEmptyString }),
  success: ChatMessage,
});

/** Upgrade to a WebSocket that streams `ChatEvent` frames for `key`. */
const events = HttpApiEndpoint.get("events", "/chats/:key/events", {
  params: KeyParams,
});

export class ChatGroup extends HttpApiGroup.make("Chat")
  .add(sendPrompt)
  .add(events) {}

export class ChatApi extends HttpApi.make("ChatApi").add(ChatGroup) {}

export const eventsUrl = (baseUrl: string, key: string) =>
  `${baseUrl.replace(/^http/, "ws")}/chats/${encodeURIComponent(key)}/events`;
