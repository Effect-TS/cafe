// The `@cafe/backend/api` export. Schema only: the browser imports this file,
// so nothing reachable from here may import Cloudflare runtime code.
import * as HttpApi from "effect/http-api/HttpApi";
import { Chat } from "./chat/chat.ts";

export { ChatEvent, ChatEventJson } from "./chat/chat-event.ts";
export { ChatMessage } from "./chat/chat-message.ts";

export class Api extends HttpApi.make("Api").add(Chat) {}
