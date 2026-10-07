import {
  Array,
  DateTime,
  Duration,
  Effect,
  Match,
  Option,
  Schema,
  Stream,
  String,
} from 'effect'
import { HttpApiClient } from 'effect/http-api'
import {
  Command,
  Http,
  ManagedResource,
  Runtime,
  Subscription,
  type Update,
} from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { Button, Input } from '@foldkit/ui'

import { Api } from '@cafe/api'
import { ChatEvent, ChatEventJson } from '@cafe/api/chat/event'
import { ChatMessage } from '@cafe/api/chat/message'

const API_URL = import.meta.env.VITE_API_URL
const apiUrls = HttpApiClient.urlBuilder(Api, { baseUrl: API_URL })
const CONNECTION_TIMEOUT_MS = 5000

// MODEL

const ChatSocket = ManagedResource.tag<WebSocket>()('ChatSocket')
type ChatSocketService = ManagedResource.ServiceOf<typeof ChatSocket>

export const ConnectionState = defineTaggedUnion({
  Disconnected: {},
  Connecting: { chatKey: Schema.String },
  Connected: { chatKey: Schema.String },
  Error: { error: Schema.String },
})
export type ConnectionState = typeof ConnectionState.Type

export const SendState = defineTaggedUnion({
  Idle: {},
  Sending: {},
  Failed: { error: Schema.String },
})
export type SendState = typeof SendState.Type

export const Model = Schema.Struct({
  chatKeyInput: Schema.String,
  connection: ConnectionState,
  messages: Schema.Array(ChatMessage),
  promptInput: Schema.String,
  send: SendState,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedChatKeyInput: { value: Schema.String },
  SubmittedChatKey: {},
  ClickedDisconnect: {},
  Connected: {},
  Disconnected: {},
  FailedConnect: { error: Schema.String },
  UpdatedPromptInput: { value: Schema.String },
  SubmittedPrompt: {},
  SucceededSendPrompt: {},
  FailedSendPrompt: { error: Schema.String },
  ReceivedChatEvent: { event: ChatEvent },
})
export type Message = typeof Message.Type

// UPDATE

type UpdateReturn = Update.Return<Model, Message, ChatSocketService>

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    UpdatedChatKeyInput: ({ value }) => ({
      model: modifyFields(model, { chatKeyInput: () => value }),
    }),

    SubmittedChatKey: () => {
      const chatKey = model.chatKeyInput.trim()

      if (String.isEmpty(chatKey)) {
        return { model }
      }

      return {
        model: modifyFields(model, {
          connection: () => ConnectionState.Connecting({ chatKey }),
          messages: () => [],
        }),
      }
    },

    ClickedDisconnect: () => ({
      model: modifyFields(model, {
        connection: () => ConnectionState.Disconnected(),
      }),
    }),

    Connected: () =>
      Match.value(model.connection).pipe(
        Match.withReturnType<UpdateReturn>(),
        Match.tag('Connecting', ({ chatKey }) => ({
          model: modifyFields(model, {
            connection: () => ConnectionState.Connected({ chatKey }),
          }),
        })),
        Match.orElse(() => ({ model })),
      ),

    Disconnected: () => ({
      model: modifyFields(model, {
        connection: () => ConnectionState.Disconnected(),
      }),
    }),

    FailedConnect: ({ error }) => ({
      model: modifyFields(model, {
        connection: () => ConnectionState.Error({ error }),
      }),
    }),

    UpdatedPromptInput: ({ value }) => ({
      model: modifyFields(model, { promptInput: () => value }),
    }),

    SubmittedPrompt: () => {
      const text = model.promptInput.trim()

      if (String.isEmpty(text)) {
        return { model }
      }

      return Match.value(model.connection).pipe(
        Match.withReturnType<UpdateReturn>(),
        Match.tag('Connected', ({ chatKey }) => ({
          model: modifyFields(model, {
            promptInput: () => '',
            send: () => SendState.Sending(),
          }),
          commands: [SendPrompt({ chatKey, text })],
        })),
        Match.orElse(() => ({ model })),
      )
    },

    SucceededSendPrompt: () => ({
      model: modifyFields(model, { send: () => SendState.Idle() }),
    }),

    FailedSendPrompt: ({ error }) => ({
      model: modifyFields(model, { send: () => SendState.Failed({ error }) }),
    }),

    ReceivedChatEvent: ({ event }) =>
      Match.value(event).pipe(
        Match.withReturnType<UpdateReturn>(),
        Match.tagsExhaustive({
          MessagePosted: ({ message: chatMessage }) => ({
            model: modifyFields(model, {
              messages: messages => [...messages, chatMessage],
            }),
          }),
        }),
      ),
  })

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    chatKeyInput: 'lobby',
    connection: ConnectionState.Disconnected(),
    messages: [],
    promptInput: '',
    send: SendState.Idle(),
  },
})

// COMMAND

export const SendPrompt = Command.define('SendPrompt', {
  args: { chatKey: Schema.String, text: Schema.String },
  messages: [Message.SucceededSendPrompt, Message.FailedSendPrompt],
  execute: ({ chatKey, text }) =>
    HttpApiClient.make(Api, { baseUrl: API_URL }).pipe(
      Effect.flatMap(client =>
        client.Chat.sendPrompt({ params: { key: chatKey }, payload: { text } }),
      ),
      Effect.as(Message.SucceededSendPrompt()),
      Effect.catch(error =>
        Effect.succeed(Message.FailedSendPrompt({ error: globalThis.String(error) })),
      ),
      Effect.provide(Http.layer),
    ),
})

// MANAGED RESOURCE

export const managedResources = ManagedResource.make<Model, Message>()(
  entry => ({
    chatSocket: entry(Schema.Option(Schema.String), {
      resource: ChatSocket,
      modelToMaybeRequirements: model =>
        Match.value(model.connection).pipe(
          Match.tag('Connecting', ({ chatKey }) => Option.some(chatKey)),
          Match.tag('Connected', ({ chatKey }) => Option.some(chatKey)),
          Match.orElse(() => Option.none()),
        ),
      acquire: chatKey =>
        Effect.callback<WebSocket, Error>(resume => {
          const ws = new WebSocket(
            String.replace(/^http/, 'ws')(
              apiUrls.Chat.events({ params: { key: chatKey } }),
            ),
          )

          const handleOpen = () => {
            ws.removeEventListener('error', handleError)
            resume(Effect.succeed(ws))
          }

          const handleError = () => {
            ws.removeEventListener('open', handleOpen)
            resume(Effect.fail(new Error('Failed to connect to WebSocket')))
          }

          ws.addEventListener('open', handleOpen)
          ws.addEventListener('error', handleError)

          return Effect.sync(() => {
            ws.removeEventListener('open', handleOpen)
            ws.removeEventListener('error', handleError)
          })
        }).pipe(
          Effect.timeout(Duration.millis(CONNECTION_TIMEOUT_MS)),
          Effect.catchTag('TimeoutError', () =>
            Effect.fail(new Error('Connection timeout')),
          ),
        ),
      release: socket =>
        Effect.sync(() => {
          socket.close()
        }),
      onAcquired: () => Message.Connected(),
      onReleased: () => Message.Disconnected(),
      onAcquireError: error =>
        Message.FailedConnect({
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
    }),
  }),
)

// SUBSCRIPTION

const decodeChatEvent = Schema.decodeUnknownOption(ChatEventJson)

const streamChatEvents = (socket: WebSocket) =>
  Subscription.fromEventFilterMap({
    target: socket,
    type: 'message',
    filterMapEvent: event =>
      Option.map(decodeChatEvent(event.data), chatEvent =>
        Message.ReceivedChatEvent({ event: chatEvent }),
      ),
  }).pipe(
    Stream.merge(
      Subscription.fromEvent({
        target: socket,
        type: 'close',
        mapEvent: () => Message.Disconnected(),
      }),
    ),
    Stream.merge(
      Subscription.fromEvent({
        target: socket,
        type: 'error',
        mapEvent: () => Message.FailedConnect({ error: 'Connection error' }),
      }),
    ),
    Stream.takeUntil(
      message =>
        message._tag === 'Disconnected' || message._tag === 'FailedConnect',
    ),
  )

export const subscriptions = Subscription.make<
  Model,
  Message,
  ChatSocketService
>()(entry => ({
  chatEvents: entry(
    { isConnected: Schema.Boolean },
    {
      modelToDependencies: model => ({
        isConnected: model.connection._tag === 'Connected',
      }),
      dependenciesToStream: ({ isConnected }) =>
        Stream.when(
          Stream.unwrap(
            ChatSocket.get.pipe(
              Effect.map(streamChatEvents),
              Effect.catchTag('ResourceNotAvailable', () =>
                Effect.succeed(Stream.empty),
              ),
            ),
          ),
          Effect.sync(() => isConnected),
        ),
    },
  ),
}))

// VIEW

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Cafe Chat',
  body: h.div(
    [
      h.Class(
        'min-h-screen bg-stone-100 flex flex-col items-center justify-center p-6',
      ),
    ],
    [
      h.div(
        [
          h.Class(
            'bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col h-[600px]',
          ),
        ],
        [
          headerView(model.connection, h),
          ConnectionState.match(model.connection, {
            Disconnected: () => chatKeyFormView(model.chatKeyInput, h),
            Connecting: () => connectingView(h),
            Connected: () => messagesView(model.messages, h),
            Error: ({ error }) => errorView(error, model.chatKeyInput, h),
          }),
          ConnectionState.match(model.connection, {
            Disconnected: () => h.empty,
            Connecting: () => h.empty,
            Connected: () => promptFormView(model.promptInput, model.send, h),
            Error: () => h.empty,
          }),
        ],
      ),
    ],
  ),
})

const headerView = (
  connection: ConnectionState,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('p-6 border-b border-stone-200 flex items-center justify-between')],
    [
      h.div(
        [],
        [
          h.div([h.Class('text-2xl font-bold text-stone-800')], ['Cafe Chat']),
          h.div(
            [h.Class('text-sm text-stone-500 mt-1')],
            [
              ConnectionState.match(connection, {
                Disconnected: () => 'Pick a chat key to join',
                Connecting: ({ chatKey }) => `Joining #${chatKey}…`,
                Connected: ({ chatKey }) => `#${chatKey}`,
                Error: () => 'Connection failed',
              }),
            ],
          ),
        ],
      ),
      ConnectionState.match(connection, {
        Disconnected: () => statusDotView('bg-stone-400', h),
        Connecting: () => statusDotView('bg-yellow-500 animate-pulse', h),
        Connected: () =>
          h.div(
            [h.Class('flex items-center gap-3')],
            [
              statusDotView('bg-green-500', h),
              Button.view(
                {
                  onClick: Message.ClickedDisconnect(),
                  toView: attributes =>
                    h.button(
                      [
                        ...attributes.button,
                        h.Class('text-sm text-stone-500 hover:text-stone-800'),
                      ],
                      ['Leave'],
                    ),
                },
                h,
              ),
            ],
          ),
        Error: () => statusDotView('bg-red-500', h),
      }),
    ],
  )

const statusDotView = (colorClass: string, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class(`w-3 h-3 rounded-full ${colorClass}`)])

const chatKeyFormView = (
  chatKeyInput: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.form(
    [
      h.Class('flex-1 p-6 flex flex-col items-center justify-center gap-4'),
      h.OnSubmit(Message.SubmittedChatKey()),
    ],
    [
      Input.view(
        {
          id: 'chat-key',
          value: chatKeyInput,
          placeholder: 'Chat key, e.g. lobby',
          onInput: value => Message.UpdatedChatKeyInput({ value }),
          toView: attributes =>
            h.input([
              ...attributes.input,
              h.Class(
                'w-64 px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500',
              ),
            ]),
        },
        h,
      ),
      Button.view(
        {
          type: 'submit',
          isDisabled: String.isEmpty(chatKeyInput.trim()),
          toView: attributes =>
            h.button(
              [
                ...attributes.button,
                h.Class(
                  'bg-amber-600 hover:bg-amber-700 data-[disabled]:opacity-50 text-white font-semibold px-8 py-3 rounded-lg transition',
                ),
              ],
              ['Join chat'],
            ),
        },
        h,
      ),
    ],
  )

const connectingView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex-1 flex items-center justify-center')],
    [h.div([h.Class('text-stone-600 font-semibold')], ['Connecting…'])],
  )

const messagesView = (
  messages: ReadonlyArray<ChatMessage>,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(messages, {
    onEmpty: () =>
      h.div(
        [h.Class('flex-1 p-6 flex items-center justify-center')],
        [
          h.p(
            [h.Class('text-stone-400')],
            ['No messages yet. Send a prompt to get started!'],
          ),
        ],
      ),
    onNonEmpty: messages =>
      h.div(
        [h.Class('flex-1 p-6 overflow-y-auto')],
        [
          h.ul(
            [h.Class('space-y-3')],
            Array.map(messages, chatMessage =>
              h.keyed('li')(
                chatMessage.id,
                [h.Class('flex flex-col items-start')],
                [
                  h.div(
                    [
                      h.Class(
                        'bg-stone-200 text-stone-800 rounded-lg px-4 py-2 max-w-md break-words',
                      ),
                    ],
                    [chatMessage.text],
                  ),
                  h.span(
                    [h.Class('text-stone-400 text-xs mt-1')],
                    [formatSentAt(chatMessage.sentAt)],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
  })

const formatSentAt = (sentAt: number): string =>
  DateTime.formatLocal(DateTime.makeUnsafe(sentAt), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const promptFormView = (
  promptInput: string,
  send: SendState,
  h: HtmlBuilder<Message>,
): Html =>
  h.form(
    [
      h.Class('p-6 border-t border-stone-200'),
      h.OnSubmit(Message.SubmittedPrompt()),
    ],
    [
      h.div(
        [h.Class('flex gap-3')],
        [
          Input.view(
            {
              id: 'prompt',
              value: promptInput,
              placeholder: 'Type a prompt…',
              onInput: value => Message.UpdatedPromptInput({ value }),
              toView: attributes =>
                h.input([
                  ...attributes.input,
                  h.Class(
                    'flex-1 px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500',
                  ),
                ]),
            },
            h,
          ),
          Button.view(
            {
              type: 'submit',
              isDisabled:
                String.isEmpty(promptInput.trim()) || send._tag === 'Sending',
              toView: attributes =>
                h.button(
                  [
                    ...attributes.button,
                    h.Class(
                      'bg-amber-600 hover:bg-amber-700 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition',
                    ),
                  ],
                  ['Send'],
                ),
            },
            h,
          ),
        ],
      ),
      SendState.match(send, {
        Idle: () => h.empty,
        Sending: () => h.empty,
        Failed: ({ error }) =>
          h.p([h.Class('text-red-600 text-sm mt-2')], [error]),
      }),
    ],
  )

const errorView = (
  error: string,
  chatKeyInput: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('flex-1 flex flex-col')],
    [
      h.div(
        [h.Class('m-6 bg-red-50 border border-red-200 rounded-lg p-4')],
        [
          h.p([h.Class('text-red-800 font-semibold mb-1')], ['Connection Error']),
          h.p([h.Class('text-red-600 text-sm')], [error]),
        ],
      ),
      chatKeyFormView(chatKeyInput, h),
    ],
  )
