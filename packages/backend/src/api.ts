// The `@cafe/backend/api` export. Schema only: the browser imports this file,
// so nothing reachable from here may import Cloudflare runtime code.
import * as HttpApi from "effect/http-api/HttpApi";
import { ChatGroup } from "./chat.ts";

export { ChatEvent, ChatEventJson } from "./chat-event.ts";
export { ChatMessage } from "./chat-message.ts";
export { eventsUrl } from "./events.ts";

export class ChatApi extends HttpApi.make("ChatApi").add(ChatGroup) {}
