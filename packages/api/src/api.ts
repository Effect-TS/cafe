import * as HttpApi from "effect/http-api/HttpApi";
import { Chat } from "./chat/index.ts";

export class Api extends HttpApi.make("Api").add(Chat) {}
