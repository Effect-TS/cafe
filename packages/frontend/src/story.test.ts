import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { ChatMessage } from '@cafe/api/chat/message'

import {
  ConnectionState,
  Message,
  Model,
  Response,
  SendPrompt,
  SendState,
  update,
} from './main'

const idleModel = Model.make({
  chatKeyInput: 'lobby',
  connection: ConnectionState.Disconnected(),
  messages: [],
  responses: [],
  promptInput: '',
  send: SendState.Idle(),
})

const connectingModel = modifyFields(idleModel, {
  connection: () => ConnectionState.Connecting({ chatKey: 'lobby' }),
})

const connectedModel = modifyFields(idleModel, {
  connection: () => ConnectionState.Connected({ chatKey: 'lobby' }),
})

const chatMessage = ChatMessage.make({
  id: '1',
  key: 'lobby',
  role: 'user',
  text: 'hi',
  sentAt: 0,
})

describe('update', () => {
  describe('joining a chat', () => {
    test('SubmittedChatKey starts connecting to the trimmed key', () => {
      story(
        update,
        given(modifyFields(idleModel, { chatKeyInput: () => '  kitchen  ' })),
        message(Message.SubmittedChatKey()),
        model(model => {
          expect(model.connection).toEqual(
            ConnectionState.Connecting({ chatKey: 'kitchen' }),
          )
        }),
      )
    })

    test('SubmittedChatKey ignores a blank key', () => {
      story(
        update,
        given(modifyFields(idleModel, { chatKeyInput: () => '   ' })),
        message(Message.SubmittedChatKey()),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
        }),
      )
    })

    test('SubmittedChatKey clears messages from a previous chat', () => {
      story(
        update,
        given(
          modifyFields(idleModel, {
            messages: () => [chatMessage],
            responses: () => [Response.Streaming({ id: 'r', text: 'partial' })],
          }),
        ),
        message(Message.SubmittedChatKey()),
        model(model => {
          expect(model.messages).toEqual([])
          expect(model.responses).toEqual([])
        }),
      )
    })

    test('Connected moves Connecting to Connected for the same key', () => {
      story(
        update,
        given(connectingModel),
        message(Message.Connected()),
        model(model => {
          expect(model.connection).toEqual(
            ConnectionState.Connected({ chatKey: 'lobby' }),
          )
        }),
      )
    })

    test('Connected is ignored unless connecting', () => {
      story(
        update,
        given(idleModel),
        message(Message.Connected()),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
        }),
      )
    })

    test('FailedConnect records the error', () => {
      story(
        update,
        given(connectingModel),
        message(Message.FailedConnect({ error: 'Timeout' })),
        model(model => {
          expect(model.connection).toEqual(
            ConnectionState.Error({ error: 'Timeout' }),
          )
        }),
      )
    })
  })

  describe('leaving a chat', () => {
    test('ClickedDisconnect disconnects', () => {
      story(
        update,
        given(connectedModel),
        message(Message.ClickedDisconnect()),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
        }),
      )
    })

    test('Disconnected disconnects', () => {
      story(
        update,
        given(connectedModel),
        message(Message.Disconnected()),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
        }),
      )
    })
  })

  describe('sending a prompt', () => {
    test('SubmittedPrompt sends the trimmed prompt to the connected key', () => {
      story(
        update,
        given(modifyFields(connectedModel, { promptInput: () => '  hello  ' })),
        message(Message.SubmittedPrompt()),
        model(model => {
          expect(model.promptInput).toBe('')
          expect(model.send._tag).toBe('Sending')
        }),
        Command.expectExact(SendPrompt({ chatKey: 'lobby', text: 'hello' })),
        Command.resolve(SendPrompt, Message.SucceededSendPrompt()),
        model(model => {
          expect(model.send._tag).toBe('Idle')
        }),
      )
    })

    test('SubmittedPrompt ignores a blank prompt', () => {
      story(
        update,
        given(modifyFields(connectedModel, { promptInput: () => '   ' })),
        message(Message.SubmittedPrompt()),
        Command.expectNone(),
        model(model => {
          expect(model.send._tag).toBe('Idle')
        }),
      )
    })

    test('SubmittedPrompt does nothing while not connected', () => {
      story(
        update,
        given(modifyFields(connectingModel, { promptInput: () => 'hello' })),
        message(Message.SubmittedPrompt()),
        Command.expectNone(),
        model(model => {
          expect(model.promptInput).toBe('hello')
        }),
      )
    })

    test('FailedSendPrompt records the error', () => {
      story(
        update,
        given(modifyFields(connectedModel, { promptInput: () => 'hello' })),
        message(Message.SubmittedPrompt()),
        Command.resolve(
          SendPrompt,
          Message.FailedSendPrompt({ error: 'Service unavailable' }),
        ),
        model(model => {
          expect(model.send).toEqual(
            SendState.Failed({ error: 'Service unavailable' }),
          )
        }),
      )
    })
  })

  describe('receiving events', () => {
    test('ReceivedChatEvent appends posted messages in order', () => {
      const second = ChatMessage.make({ ...chatMessage, id: '2', text: 'there' })

      story(
        update,
        given(connectedModel),
        message(
          Message.ReceivedChatEvent({
            event: { _tag: 'MessagePosted', message: chatMessage },
          }),
        ),
        message(
          Message.ReceivedChatEvent({
            event: { _tag: 'MessagePosted', message: second },
          }),
        ),
        model(model => {
          expect(model.messages).toEqual([chatMessage, second])
        }),
      )
    })

    test('ResponseDelta accumulates a streaming response', () => {
      story(
        update,
        given(connectedModel),
        message(
          Message.ReceivedChatEvent({
            event: { _tag: 'ResponseDelta', responseId: 'r', text: 'Hel' },
          }),
        ),
        message(
          Message.ReceivedChatEvent({
            event: { _tag: 'ResponseDelta', responseId: 'r', text: 'lo' },
          }),
        ),
        model(model => {
          expect(model.responses).toEqual([
            Response.Streaming({ id: 'r', text: 'Hello' }),
          ])
        }),
      )
    })

    test('the posted assistant message replaces its streaming response', () => {
      const reply = ChatMessage.make({
        id: 'r',
        key: 'lobby',
        role: 'assistant',
        text: 'Hello',
        sentAt: 1,
      })

      story(
        update,
        given(
          modifyFields(connectedModel, {
            responses: () => [Response.Streaming({ id: 'r', text: 'Hel' })],
          }),
        ),
        message(
          Message.ReceivedChatEvent({
            event: { _tag: 'MessagePosted', message: reply },
          }),
        ),
        model(model => {
          expect(model.messages).toEqual([reply])
          expect(model.responses).toEqual([])
        }),
      )
    })

    test('ResponseFailed marks the response as failed', () => {
      story(
        update,
        given(
          modifyFields(connectedModel, {
            responses: () => [Response.Streaming({ id: 'r', text: 'Hel' })],
          }),
        ),
        message(
          Message.ReceivedChatEvent({
            event: {
              _tag: 'ResponseFailed',
              responseId: 'r',
              error: 'model unavailable',
            },
          }),
        ),
        model(model => {
          expect(model.responses).toEqual([
            Response.Failed({ id: 'r', error: 'model unavailable' }),
          ])
        }),
      )
    })
  })
})
