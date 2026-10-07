import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import { Events } from "./events.ts";
import { SendPrompt } from "./send-prompt.ts";

export class ChatGroup extends HttpApiGroup.make("Chat")
  .add(SendPrompt)
  .add(Events) {}
