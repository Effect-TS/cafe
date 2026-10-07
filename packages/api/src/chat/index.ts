import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import { SendPrompt } from "./send-prompt.ts";

export class Chat extends HttpApiGroup.make("Chat").add(SendPrompt) {}
